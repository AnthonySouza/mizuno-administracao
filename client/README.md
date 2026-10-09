# Mizuno Propostas · primeira etapa

Esta é uma versão **local** para revisar o fluxo de propostas. Ela contém o cadastro de autores, o cadastro de livros e o kanban. Cada cartão pode ser arrastado com o mouse para outra coluna ou clicado para editar título, autor, formato, tipo de capa, impressão, páginas, dificuldade, observações e status. Os dados de contato ficam no cadastro do autor.

Formato e tipo de capa têm opções prontas e a opção **+ Cadastrar outro**. Ao salvar a proposta, a nova opção fica disponível nas próximas. A impressão pode ser **P&B** ou **Colorido**.

A dificuldade vai de **Nível 1** a **Nível 10** (crescente). Propostas antigas com Fácil, Média ou Difícil mantêm o valor até você selecionar um nível.

A proposta também tem prioridade: **Baixo** (azul), **Médio** (amarelo), **Alto** (laranja), **Urgente** (vermelho) e **🔥 Extremo** (vermelho escuro). O quadro mostra quatro cartões por coluna e oferece rolagem vertical para os demais. Use **Kanban / Lista** para alternar a visualização. No cadastro do autor ou na proposta, os botões de WhatsApp e e-mail abrem o contato informado. Sem contato válido, ficam desabilitados. A quantidade de livros do autor abre uma janela própria com os títulos vinculados.

Os contatos agora aparecem como ícones. Os cadastros de **Autor** e **Livro** têm **Selecionar pasta**: escolha uma pasta na janela do Windows e salve o cadastro para guardar o caminho. Depois, **Abrir pasta** abre esse destino. Esta função opera no computador que executa o programa local; na futura instalação no NAS, a escolha de pastas dos computadores da equipe precisará de uma integração própria.

Pastas de rede salvas como `//servidor/compartilhamento/...` são convertidas para o formato de rede do Windows ao abrir. Se o Explorador pedir autenticação, use a conta que já acessa o NAS.

No formulário do livro, os ícones de contato ficam à direita do rótulo **Autor**, os comandos de pasta ficam ao lado de **Pasta do livro** e a prioridade aparece em uma lista no canto superior direito.
O cabeçalho do livro organiza título, prioridade e botão de fechar em uma linha; em telas estreitas, a prioridade passa para uma segunda linha alinhada à direita.

Os livros ficam sempre ordenados por prioridade: **Extremo → Urgente → Alto → Médio → Baixo → A definir**. No kanban, isso vale dentro de cada coluna; na lista, vale para todos os livros exibidos. Arrastar muda o status, e o cartão assume sua posição pela prioridade.

O quadro usa cores e ícones próprios para cada etapa, cartões com dados compactos e mensagens claras nas colunas vazias. Os indicadores no topo também mostram ícones.
Na visualização em **Lista**, cada linha e seu status usam a mesma cor da coluna correspondente no kanban; a prioridade também aparece como etiqueta colorida.
Os cartões do kanban se ajustam aos dados preenchidos e ficam empilhados sem lacunas. Quando há mais de quatro livros, a rolagem começa após o quarto cartão. O destaque ao passar o mouse preserva a borda superior do cartão.

Colunas: **Novo contato → Em avaliação → Proposta enviada → Aguardando → Aprovada → Recusada**. No cadastro, apenas título e autor são obrigatórios.

## Como testar

1. Descompacte a pasta completa e dê dois cliques em `iniciar-propostas.cmd`.
2. O navegador abrirá em `http://127.0.0.1:8766`. Use a guia **Autores** para cadastrar e editar contatos.
   Ao abrir um autor, clique na quantidade de livros no canto superior para ver os títulos vinculados. Clique em um título para abrir a proposta desse livro.
3. Cadastre um livro pelo botão **Novo livro**. Pesquise e selecione um autor cadastrado ou use **Cadastrar novo autor** na própria tela da proposta.
4. Arraste o cartão para mudar o status. Clique nele para editar os dados.
5. Deixe a janela de comando aberta durante o teste. Pressione `Ctrl+C` para parar.

O iniciador usa o Python empacotado com Codex neste computador. Se ele não existir, tenta `py -3` do Windows. Não há instalação de bibliotecas. Os cadastros ficam em `data/propostas.sqlite3` dentro da pasta descompactada e permanecem após fechar o navegador.

**Se você já usou a versão anterior:** feche a janela preta do programa com `Ctrl+C`, faça uma cópia da pasta `data` e substitua somente os arquivos do programa pelos desta versão. Abra novamente pelo iniciador e atualize a página com `Ctrl+F5`. Confirme que aparece **v0.15 · Uso local** no topo. Se o servidor antigo continuar aberto, o sistema mostrará um aviso e impedirá o uso silencioso de campos novos sem gravação.

**Busca rápida:** pressione `Ctrl+K` no Windows ou `⌘K` no Mac em qualquer tela. Digite o título do livro ou o nome do autor; use as setas para escolher, `Enter` para abrir e `Esc` para fechar.

Este protótipo abre apenas em `127.0.0.1`; não deve ser exposto na rede da editora. Login, acesso simultâneo, PDF e produção pertencem às próximas etapas, depois que o fluxo do kanban estiver definido.
