# -*- coding: utf-8 -*-
"""把 src/ 下的模板与脚本拼成单文件 HTML。"""
import io, os

base = os.path.dirname(os.path.abspath(__file__))
def r(name):
    p = os.path.join(base, 'src', name)
    with io.open(p, 'r', encoding='utf-8') as f:
        return f.read()

css = r('app.css')
js = '\n'.join([r('core.js'), r('human.js'), r('make.js'), r('demo.js'), r('app.js')])
tpl = r('template.html')
out = tpl.replace('/*CSS*/', css).replace('/*JS*/', js)
with io.open(os.path.join(base, '数独工坊.html'), 'w', encoding='utf-8') as f:
    f.write(out)
print('built', len(out), 'chars')
