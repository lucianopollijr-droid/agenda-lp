#!/usr/bin/env python3
"""Monta o app de agenda do Luciano.

Uso: python3 montar.py dados.json estado.json saida.html
  dados.json  -> o dia (eventos, carro, prazos, minhas, acomp) que a rotina escreve
  estado.json -> o que o Luciano marcou (marks, prazos, extra, notes); {} no primeiro dia
Depois publique saida.html com a ferramenta Artifact, passando a URL fixa da agenda.
"""
import base64, json, sys

dados_p, estado_p, saida_p = sys.argv[1], sys.argv[2], sys.argv[3]
dados = open(dados_p, encoding='utf-8').read().rstrip('\n')
estado = json.dumps(json.load(open(estado_p, encoding='utf-8')), ensure_ascii=False)
css = open('estilo.css', encoding='utf-8').read()
appjs = open('app.js', encoding='utf-8').read()

FONTES = ('<link rel="preconnect" href="https://fonts.googleapis.com">\n'
          '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
          '<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&display=swap" rel="stylesheet">')

HEADBITS = ('<meta charset="UTF-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">\n'
            '<meta name="theme-color" content="#F3F0E8">\n'
            '<meta name="apple-mobile-web-app-capable" content="yes">\n'
            '<meta name="apple-mobile-web-app-title" content="Agenda">\n'
            '<title>Agenda · Luciano Polli</title>\n' + FONTES)

MARKUP = """<div class="page">
  <div class="topbar">
    <div class="topline">
      <div class="topdate" id="topdate"></div>
      <div style="display:flex;align-items:center;gap:10px">
        <span class="savechip" id="savechip">Conectando…</span>
        <span class="topname">LUCIANO POLLI</span>
      </div>
    </div>
    <div class="tabs" id="tabs"></div>
  </div>
  <div id="view"></div>
</div>"""

BLOCOS = ('<script type="application/json" id="dados-do-dia">\n' + dados + '\n</script>\n'
          '<script type="application/json" id="estado">\n__ESTADO_JSON__\n</script>\n'
          '<script type="text/plain" id="tpl">__TPL_B64__</script>')

CORPO = BLOCOS + "\n<style>\n" + css + "\n</style>\n" + MARKUP + '\n<script>\n' + appjs + '\n</script>'
TEMPLATE = ('<!DOCTYPE html>\n<html lang="pt-BR">\n<head>\n' + HEADBITS + '\n</head>\n<body>\n'
            + CORPO + '\n</body>\n</html>\n')

assert TEMPLATE.count('__ESTADO_JSON__') == 1 and TEMPLATE.count('__TPL_B64__') == 1, \
    'placeholder duplicado — o app.js nao pode conter os marcadores literais'

b64 = base64.b64encode(TEMPLATE.encode('utf-8')).decode('ascii')
assert base64.b64decode(b64).decode('utf-8') == TEMPLATE

conteudo = ('<title>Agenda · Luciano Polli</title>\n' + FONTES + '\n' + CORPO)
conteudo = conteudo.replace('__ESTADO_JSON__', estado, 1).replace('__TPL_B64__', b64, 1)
open(saida_p, 'w', encoding='utf-8').write(conteudo)
print('ok:', saida_p, len(conteudo), 'bytes')
