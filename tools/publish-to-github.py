# -*- coding: utf-8 -*-
"""把本仓库发布到 GitHub。

本机网络现状（实测）：
    github.com:443   被封 → 网页打不开，无法在浏览器里生成令牌
    api.github.com   直连可用 → 建仓、加公钥这类 REST 操作没问题
    github.com:22    SSH 握手正常 → git push 走 SSH 完全可用

所以流程是：
    ① 用令牌建仓库
    ② 用令牌上传本机 SSH 公钥（需要 classic 令牌的 admin:public_key 权限）
    ③ 配好公钥 → git push 走 22 端口；公钥加不上 → 退回 REST API 上传整棵树
两条路都能把文件传上去，区别只是以后推送是 `git push` 还是重跑本脚本。

用法：
    python tools/publish-to-github.py --token <TOKEN> --repo sudoku-workshop
    python tools/publish-to-github.py --dry-run

令牌：必须用 classic PAT（fine-grained 不支持用户级 /user/keys 端点）
      勾 `repo` + `admin:public_key`，两条路都能走通。
      只勾 `repo` 也能上传，但只能走 API 兜底，以后每次改动都要重跑脚本。
"""
import argparse
import base64
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request

API = 'https://api.github.com'
SSH_KEY = os.path.expanduser('~/.ssh/id_ed25519.pub')


def git(*args):
    env = dict(os.environ)
    # github.com:22 实测被拒（Connection refused），改走 ssh.github.com:443
    env['GIT_SSH_COMMAND'] = ('ssh -p 443 -o StrictHostKeyChecking=accept-new '
                              '-o BatchMode=yes')
    # core.quotepath=false 让中文文件名原样输出，否则统计大小会把它们当成不存在
    r = subprocess.run(['git', '-c', 'core.quotepath=false'] + list(args),
                       stdout=subprocess.PIPE, stderr=subprocess.STDOUT, env=env)
    return r.returncode, r.stdout.decode('utf-8', 'replace').strip()


def call(method, path, token, payload=None, expect=()):
    data = None
    headers = {
        'Authorization': 'Bearer ' + token,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'sudoku-workshop-publisher',
    }
    if payload is not None:
        data = json.dumps(payload).encode('utf-8')
        headers['Content-Type'] = 'application/json'
    req = urllib.request.Request(API + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            body = r.read()
            return r.status, (json.loads(body) if body else None)
    except urllib.error.HTTPError as e:
        text = e.read().decode('utf-8', 'replace')
        if e.code in expect:
            return e.code, None
        raise SystemExit('请求失败 %s %s -> %s\n%s' % (method, path, e.code, text[:600]))


def api_upload(token, base, files, message):
    """REST 兜底：blob → tree → commit → ref，一次提交整棵树。"""
    # 空仓库返回 409（Git Repository is empty），新仓库返回 404，两种都当无父提交
    st, ref = call('GET', base + '/git/ref/heads/main', token, expect=(404, 409))
    if st == 409:
        # 空仓库连 blob 都不让建（409），先用 contents API 落一个提交打底
        call('PUT', base + '/contents/.gitkeep', token,
             {'message': 'chore: 初始化仓库', 'content': ''})
        st, ref = call('GET', base + '/git/ref/heads/main', token)
    parent = ref['object']['sha'] if (st == 200 and ref) else None
    blobs = []
    for i, p in enumerate(files, 1):
        with open(p, 'rb') as f:
            content = base64.b64encode(f.read()).decode('ascii')
        st, blob = call('POST', base + '/git/blobs', token,
                        {'content': content, 'encoding': 'base64'})
        blobs.append({'path': p.replace(os.sep, '/'), 'mode': '100644',
                      'type': 'blob', 'sha': blob['sha']})
        print('   blob %d/%d  %s' % (i, len(files), p))
    st, tree = call('POST', base + '/git/trees', token, {'tree': blobs})
    st, commit = call('POST', base + '/git/commits', token,
                      {'message': message, 'tree': tree['sha'],
                       'parents': [parent] if parent else []})
    if parent:
        call('PATCH', base + '/git/refs/heads/main', token,
             {'sha': commit['sha'], 'force': False})
    else:
        call('POST', base + '/git/refs', token,
             {'ref': 'refs/heads/main', 'sha': commit['sha']})
    print('   已建提交 %s' % commit['sha'][:10])
    return commit['sha']


def set_remote(login, repo):
    """remote 走 ssh.github.com:443 —— 本机 github.com:22 被拒，443 可用。"""
    git('remote', 'remove', 'origin')
    code, out = git('remote', 'add', 'origin',
                    'git@ssh.github.com:%s/%s.git' % (login, repo))
    if code != 0:
        raise SystemExit('配置 remote 失败：%s' % out)
    # 让用户以后手动 `git push` 也走 443，不必每次带环境变量
    git('config', 'core.sshCommand',
        'ssh -p 443 -o StrictHostKeyChecking=accept-new')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--token', default=os.environ.get('GITHUB_TOKEN', ''))
    ap.add_argument('--repo', default='sudoku-workshop')
    ap.add_argument('--public', action='store_true', help='默认建私有仓库')
    ap.add_argument('--dry-run', action='store_true')
    args = ap.parse_args()

    code, tracked = git('ls-files')
    files = [p for p in tracked.split('\n') if p]
    total = sum(os.path.getsize(p) for p in files if os.path.exists(p))
    missing = [p for p in files if not os.path.exists(p)]
    print('本地待发布：%d 个文件，%.2f MB' % (len(files), total / 1048576.0))
    if missing:
        print('  注意：%d 个文件在工作区不存在，将跳过：%s' % (len(missing), ', '.join(missing[:3])))
        files = [p for p in files if os.path.exists(p)]
    print('SSH 公钥：%s' % ('已就绪' if os.path.exists(SSH_KEY) else '缺失'))

    if args.dry_run:
        print('\n[dry-run] 将依次执行：建仓 → 试加公钥 → 成功则 git push（22 端口），'
              '失败则 REST API 上传')
        return

    if not args.token:
        raise SystemExit('缺少令牌：用 --token 传入，或设置 GITHUB_TOKEN。')

    st, me = call('GET', '/user', args.token)
    login = me['login']
    print('\n① 已认证为 %s' % login)

    payload = {
        'name': args.repo,
        'private': not args.public,
        'description': '数独工坊：单文件数独应用，13 种玩法、SE 十级难度、A4 练习册打印、手机适配',
        'auto_init': False,
        'has_issues': True,
        'has_wiki': False,
    }
    st, _ = call('POST', '/user/repos', args.token, payload, expect=(422,))
    print('② 仓库 %s/%s %s' % (login, args.repo,
                              '已存在，继续' if st == 422 else '已创建（%s）'
                              % ('公开' if args.public else '私有')))

    base = '/repos/%s/%s' % (login, args.repo)
    ssh_ready = False
    if os.path.exists(SSH_KEY):
        with open(SSH_KEY, 'r', encoding='utf-8') as f:
            pub = f.read().strip()
        title = 'workbuddy@%s' % os.environ.get('COMPUTERNAME', 'windows')
        st, _ = call('POST', '/user/keys', args.token,
                     {'title': title, 'key': pub}, expect=(422, 403, 404))
        if st in (200, 201, 422):
            ssh_ready = True
            print('③ SSH 公钥 %s' % ('已在该账号上，跳过' if st == 422 else '已添加'))
        else:
            print('③ 令牌缺少 admin:public_key 权限（%s），跳过公钥，改用 API 上传' % st)

    if ssh_ready:
        set_remote(login, args.repo)
        print('④ remote 指向 git@ssh.github.com:%s/%s.git（走 443 端口）' % (login, args.repo))

        code, br = git('rev-parse', '--abbrev-ref', 'HEAD')
        if br and br != 'main':
            git('branch', '-M', 'main')
            print('   本地分支 %s 已重命名为 main' % br)

        code, out = git('push', '-u', 'origin', 'HEAD:main')
        print('⑤ git push %s' % ('成功' if code == 0 else '失败'))
        if out:
            print('   ' + out.replace('\n', '\n   '))
        if code != 0:
            print('   改用 API 上传')
            ssh_ready = False

    if not ssh_ready:
        code, msg = git('log', '-1', '--format=%B')
        print('④ 通过 REST API 上传整棵树')
        api_upload(args.token, base, files, msg or '初始提交')
        set_remote(login, args.repo)

    code, out = git('ls-remote', '--heads', 'origin')
    ok = code == 0 and 'refs/heads/main' in out
    print('⑥ 远端校验：%s' % ('refs/heads/main 已存在' if ok else '未找到 main 分支'))
    print('\n仓库地址：https://github.com/%s/%s' % (login, args.repo))
    if ssh_ready:
        print('以后改完直接 `git push` 即可，不需要令牌。')
    else:
        print('以后改动需重跑本脚本（或给令牌补 admin:public_key 权限后配好 SSH）。')


if __name__ == '__main__':
    sys.exit(main())
