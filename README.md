# Finanças Cloud V8 — limpa e completa

Essa versão foi criada do zero, com todos os arquivos completos, para evitar mistura de V6/V7/V7.4.

## Arquivos
- index.html
- styles.css
- app.js
- firebase-config.js
- firestore-rules.txt
- manifest.json
- favicon.svg
- README.md

## Recursos
- Login Google por redirect, sem pop-up.
- Dados separados por usuário em users/{uid}.
- Usuário novo começa zerado.
- Controle por mês e ano.
- Histórico mensal.
- Contas fixas base.
- Contas do mês com status Pago/Pendente/Atrasado.
- Resetar status do mês.
- Resetar mês inteiro.
- Gastos extras.
- Receitas extras.
- Parcelas automáticas por mês.
- Cartões e compras parceladas.
- Metas.
- Resumo anual.
- Temas: roxo, escuro, azul, verde e claro.
- Layout responsivo para PC, tablet e celular.
- Backup/exportação/importação.

## Como subir
1. Extraia o ZIP.
2. No GitHub, apague/substitua TODOS os arquivos antigos.
3. Suba todos os arquivos da V8.
4. Edite firebase-config.js com suas chaves do Firebase.
5. Firebase Authentication > Sign-in method > Google: ativado.
6. Firebase Authentication > Settings > Authorized domains: adicione seu domínio GitHub Pages.
7. Firestore > Regras: cole firestore-rules.txt e publique.
8. Abra o site e pressione Ctrl + F5.

## Domínio autorizado
Exemplo:
mayconaraujogo-arch.github.io
