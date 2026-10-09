# Guia para agentes

## Contexto do projeto

- A interface está em `client/`, em JavaScript/CSS puro. O backend Python, sua persistência SQLite local e seus testes devem ficar em `server/`.
- `client/server.py` e `client/tests.py` são a estrutura legada. Na próxima alteração de backend, migre-os juntos para `server/`, atualize iniciador, caminhos de arquivos estáticos, imports e documentação. Não mantenha duas implementações do servidor.
- Preserve o funcionamento local em `127.0.0.1` e evite incluir dependências ou frameworks sem necessidade explícita.
- Mantenha textos e mensagens voltados ao usuário em português.

## Código legível e modular

- Comente o código quando a intenção, regra de negócio ou decisão técnica não for evidente. Explique o **porquê**, nunca apenas repita o que a instrução faz.
- Cada função deve ter no máximo 20 linhas. Quando atingir esse limite, extraia responsabilidades para funções pequenas, bem nomeadas e testáveis.
- Evite encadeamentos longos de chamadas, ternários aninhados e expressões que tratam muitas responsabilidades de uma vez. Prefira variáveis intermediárias e funções auxiliares com nomes descritivos.
- Dê a cada função e módulo uma responsabilidade clara. Use nomes que expressem intenção, elimine duplicação e centralize regras de negócio compartilhadas.
- Use anotações de tipo explícitas nas interfaces Python. Trate erros esperados de forma específica, com mensagens acionáveis; não oculte exceções nem use `except` genérico sem justificativa.
- Feche arquivos, conexões e outros recursos mesmo em caso de erro, preferencialmente com gerenciadores de contexto.
- Siga o estilo predominante do projeto, revise todo o diff antes de concluir e atualize a documentação sempre que mudar comportamento, execução ou arquitetura.
- Faça alterações pequenas e coesas; não refatore trechos sem relação com a tarefa.

## Segurança e dados

- Valide toda entrada no servidor e use consultas SQL parametrizadas; nunca concatene dados do usuário em SQL.
- Preserve a proteção CSRF nas rotas que alteram dados e valide caminhos antes de abrir pastas no Windows.
- Trate alterações no esquema SQLite como migrações retrocompatíveis e não destrutivas, preservando bancos locais existentes.
- Escape qualquer conteúdo dinâmico antes de inseri-lo no DOM. Não use interpolação HTML com dados não confiáveis sem a função de escape apropriada.

## Contratos e testes

- Ao alterar uma API, atualize em conjunto o servidor, o cliente e os testes para manter seus contratos sincronizados.
- Crie ou atualize casos para caminhos válidos, entradas inválidas, regressões e contratos HTTP. Isole dados temporários e nunca use o banco local real durante a suíte.
- Enquanto os testes estiverem no legado, execute `py -3 client/tests.py`. Após a migração, use `py -3 server/tests.py` (ou o Python empacotado equivalente) e informe o resultado antes de concluir mudanças de código.
- Não versione bancos SQLite locais, caches, `__pycache__` ou outros artefatos gerados.
