# Finanças Maycon V3 Cloud

Versão com sincronização em nuvem usando Firebase Firestore.

## O que muda
- Continua funcionando localmente.
- Com Firebase configurado, sincroniza PC e celular.
- Alterou no PC? Aparece no celular.
- Alterou no celular? Aparece no PC.

## Arquivos
- index.html
- styles.css
- app.js
- firebase-config.js
- manifest.json
- firestore-rules.txt
- README.md

## Como configurar o Firebase

1. Acesse https://console.firebase.google.com/
2. Clique em Criar projeto.
3. Crie um projeto chamado `financas-maycon`.
4. Dentro do projeto, vá em Firestore Database.
5. Clique em Criar banco de dados.
6. Escolha modo teste.
7. Vá em Project settings > Your apps.
8. Clique em Web app.
9. Copie o objeto `firebaseConfig`.
10. Abra o arquivo `firebase-config.js`.
11. Cole os dados no lugar de COLE_AQUI.
12. Suba todos os arquivos no GitHub por cima dos atuais.

## Regras do Firestore
Para funcionar rápido, use as regras do arquivo `firestore-rules.txt`.

Atenção: essas regras são abertas. Para uso pessoal básico, funciona. Depois dá para proteger com login.
