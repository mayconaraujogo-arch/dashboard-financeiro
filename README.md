# Finanças Cloud V5

Versão completa com:
- Login Google
- Primeiro nome dinâmico
- Cada usuário com seus próprios dados
- Usuário novo começa zerado
- Firestore com regras por UID
- Dashboard financeiro responsivo

## Arquivos do projeto
- index.html
- styles.css
- app.js
- firebase-config.js
- firestore-rules.txt
- manifest.json
- favicon.svg
- README.md

## Como instalar no GitHub Pages
1. Extraia o ZIP.
2. No GitHub, apague/substitua todos os arquivos antigos.
3. Suba TODOS os arquivos desta pasta.
4. Edite o arquivo firebase-config.js com as chaves do seu Firebase.
5. Ative Authentication > Google no Firebase.
6. Em Firestore > Regras, cole o conteúdo de firestore-rules.txt.
7. Aguarde o GitHub Pages atualizar.
8. Abra o site e pressione Ctrl + F5.

## Regras importantes
Usuários novos começam com dados zerados.
Cada usuário acessa apenas o próprio documento: users/{uid}.
