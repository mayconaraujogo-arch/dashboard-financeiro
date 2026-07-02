# Finanças Cloud V7.4 — Login corrigido

Correção principal:
- O login Google agora usa redirect direto, sem pop-up.
- Isso evita o bug de clicar e só piscar.
- Mostra mensagens claras se:
  - Google não estiver ativado no Firebase.
  - Domínio do GitHub Pages não estiver autorizado.
  - Firebase config estiver incompleto.

Mantém:
- Botões funcionando
- Troca de tema
- Interface responsiva
- Histórico mensal
- Gastos, receitas, parcelas, cartões, metas e resumo anual

## Depois de subir
1. Preencha firebase-config.js com suas chaves.
2. Firebase > Authentication > Sign-in method > Google: ativado.
3. Firebase > Authentication > Settings > Authorized domains:
   adicione seu domínio GitHub Pages, exemplo:
   mayconaraujogo-arch.github.io
4. GitHub Pages: aguarde atualizar.
5. Abra o site e aperte Ctrl + F5.
