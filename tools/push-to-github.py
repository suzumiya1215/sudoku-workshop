# -*- coding: utf-8 -*-
"""把当前仓库推送到 GitHub。

本机到 github.com 的连接被代理拦截（git push 走不通），但 api.github.com 正常，
所以这里用 GitHub REST API 的 Git Data 接口一次性提交整棵树，
比逐个文件调 Contents API 更接近一次真实的提交。

用法：
    python tools/push-to-github.py --token <TOKEN> --repo sudoku-workshop
    python tools/push-to-github.py --token <TOKEN> --dry-run      # 只演练，不联网

Token 权限：classic 需勾 repo；fine-grained 需 Contents(读写) + Administration(读写，用于建仓)。
也可以用环境变量 GITHUB_TOKEN 代替 --token。
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


def git(*args):
    out = subprocess.run(['git'] + list(args), stdout=subprocess.PIPE,
                         stderr=subprocess.PIPE, check=True)
    return out.stdout


def repo_files():
    """取已跟踪文件（尊重 .gitignore，和本地提交保持一致）。"""
    raw = git('ls-files', '-z')
    paths = [p.decode('utf-8') for p in raw.split(b'\x00') if p]
    return paths


def call(method, path, token, payload=None, expect=()):
    url = API + path
    data = None
    headers = {
        'Authorization': 'Bearer ' + token,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'sudoku-workshop-pusher',
    }
    if payload is not None:
        data = json.dumps(payload).encode('utf-8')
        headers['Content-Type'] = 'application/json'
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            body = r.read()
            return r.status, (json.loads(body) if body else None)
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8', 'replace')
        if e.code in expect:
            return e.code, None
        raise SystemExit('请求失败 %s %s -> %s\n%s' % (method, path, e.code, body[:600]))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--token', default=os.environ.get('GITHUB_TOKEN', ''))
    ap.add_argument('--repo', default='sudoku-workshop')
    ap.add_argument('--public', action='store_true', help='默认建私有仓库')
    ap.add_argument('--message', default='')
    ap.add_argument('--dry-run', action='store_true')
    args = ap.parse_args()

    paths = repo_files()
    total = sum(os.path.getsize(p) for p in paths)
    print('待上传 %d 个文件，合计 %.2f MB' % (len(paths), total / 1048576.0))
    for p in paths:
        print('  %-46s %8d B' % (p, os.path.getsize(p)))

    if args.dry_run:
        print('\n[dry-run] 未联网。去掉 --dry-run 并给 --token 即会实际创建仓库并提交。')
        return

    if not args.token:
        raise SystemExit('缺少 token：用 --token 传入，或设置环境变量 GITHUB_TOKEN。')

    st, me = call('GET', '/user', args.token)
    login = me['login']
    print('\n已认证为 %s' % login)

    payload = {
        'name': args.repo,
        'private': not args.public,
        'description': '数独工坊：单文件数独应用，13 种玩法、SE 十级难度、A4 练习册打印、手机适配',
        'auto_init': False,
        'has_issues': True,
        'has_wiki': False,
    }
    st, _ = call('POST', '/user/repos', args.token, payload, expect=(422,))
    print('仓库 %s/%s %s' % (login, args.repo,
                            '已存在，继续推送' if st == 422 else '已创建（%s）'
                            % ('公开' if args.public else '私有')))

    base = '/repos/%s/%s' % (login, args.repo)

    # 已有提交就以它为父，否则这是空仓库
    st, ref = call('GET', base + '/git/ref/heads/main', args.token, expect=(404,))
    parent = None
    if st == 200 and ref:
        parent = ref['object']['sha']
        print('基于现有提交 %s' % parent[:10])

    blobs = []
    for i, p in enumerate(paths, 1):
        with open(p, 'rb') as f:
            content = base64.b64encode(f.read()).decode('ascii')
        st, blob = call('POST', base + '/git/blobs', args.token,
                        {'content': content, 'encoding': 'base64'})
        blobs.append({'path': p.replace(os.sep, '/'), 'mode': '100644',
                      'type': 'blob', 'sha': blob['sha']})
        print('  blob %d/%d  %s' % (i, len(paths), p))

    st, tree = call('POST', base + '/git/trees', args.token, {'tree': blobs})
    message = args.message or git('log', '-1', '--format=%B').decode('utf-8').strip()
    commit_payload = {'message': message, 'tree': tree['sha']}
    if parent:
        commit_payload['parents'] = [parent]
    else:
        commit_payload['parents'] = []
    st, commit = call('POST', base + '/git/commits', args.token, commit_payload)
    print('已建提交 %s' % commit['sha'][:10])

    if parent:
        call('PATCH', base + '/git/refs/heads/main', args.token, {'sha': commit['sha'], 'force': False})
    else:
        call('POST', base + '/git/refs', args.token,
             {'ref': 'refs/heads/main', 'sha': commit['sha']})

    url = 'https://github.com/%s/%s' % (login, args.repo)
    print('\n完成：%s' % url)
    print('本地已加 remote origin（github.com 在本机被拦，直连 push 仍会失败，'
          '日常改动可继续用本脚本推送）')
    subprocess.run(['git', 'remote', 'remove', 'origin'], stderr=subprocess.DEVNULL)
    subprocess.run(['git', 'remote', 'add', 'origin', 'https://github.com/%s/%s.git'
                    % (login, args.repo)])


if __name__ == '__main__':
    sys.exit(main())
