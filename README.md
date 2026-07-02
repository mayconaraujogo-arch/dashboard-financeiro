# Finanças Cloud V8.1 — Login híbrido completo

Versão completa com todos os arquivos.

Correção principal:
- Login Google refeito.
- Agora tenta popup primeiro.
- Se o navegador bloquear popup, cai para redirect.
- Usa persistência local do Firebase para manter a conta logada.
- Mostra erro visível na tela se algo falhar.

Checklist obrigatório no Firebase:
1. Authentication > Sign-in method > Google: ativado.
2. Authentication > Settings > Authorized domains:
   - mayconaraujogo-arch.github.io
   - financas-maycon.firebaseapp.com
3. Firestore > Rules:
   cole o conteúdo de firestore-rules.txt.

Depois de subir:
- Aguarde o GitHub Pages publicar.
- Abra em aba anônima.
- Teste o login.
