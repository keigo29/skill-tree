# index.html（GitHub Pages 用）と、claude.ai 用の1枚ファイル（core.js と app.js を中に入れたもの）を作る
# 使い方：python3 build.py
import sys, pathlib
here=pathlib.Path(__file__).parent
out=pathlib.Path(sys.argv[1]) if len(sys.argv)>1 else here/'dist'
out.mkdir(exist_ok=True)
style=(here/'src/style.html').read_text(); body=(here/'src/body.html').read_text()
fonts='''<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Josefin+Sans:wght@300;400;600&family=Zen+Kaku+Gothic+New:wght@400;500;700&display=swap">
'''
luc='<script src="https://cdn.jsdelivr.net/npm/lucide@0.460.0/dist/umd/lucide.min.js"></script>\n'
core=(here/'core.js').read_text(); app=(here/'app.js').read_text()
idx=f'''<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#0c0e13">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<title>ビジネス力スキルツリー</title>
{fonts}{style}
<style>:root{{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}}</style>
</head>
<body>
{body}{luc}<script src="core.js"></script>
<script src="app.js"></script>
</body>
</html>
'''
(here/'index.html').write_text(idx)
art=f'''<title>ビジネス力スキルツリー</title>
<meta name="claude:viewport-fit-sides" content="cover">
{fonts}{style}
{body}{luc}<script>
{core}
</script>
<script>
{app}
</script>
'''
(out/'skilltree.html').write_text(art)
print('built')
