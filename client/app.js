const appState = {statuses:[], proposals:[], authors:[], options:{book_format:[],cover_type:[]}, search:'', authorSearch:'', view:'proposals', proposalDisplay:'kanban', draggingId:null, dropStarted:false, suppressClickUntil:0};
const csrf = document.querySelector('meta[name="csrf-token"]').content;
const el = selector => document.querySelector(selector);
const safe = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const dateLabel = value => value ? new Date(value).toLocaleDateString('pt-BR') : '';
const priorityClass = value => ({Baixo:'low','Médio':'medium',Alto:'high',Urgente:'urgent',Extremo:'extreme'})[value] || '';
const priorityText = value => value === 'Extremo' ? '🔥 Extremo' : value;
const priorityRank = value => ({Extremo:0,Urgente:1,Alto:2,'Médio':3,Baixo:4})[value] ?? 5;
const boardIcons = {
  book:'<path d="M12 5c-2.4-1.5-5.2-1.8-9-1.2v14c3.8-.6 6.6-.3 9 1.2 2.4-1.5 5.2-1.8 9-1.2v-14c-3.8-.6-6.6-.3-9 1.2Z"/><path d="M12 5v14"/>',
  document:'<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h4M9 12h6M9 16h6"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  check:'<path d="m4 12 5 5L20 6"/>',
  users:'<circle cx="9" cy="8" r="3"/><path d="M3 19v-2a6 6 0 0 1 12 0v2zM17 5a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 5"/>',
  send:'<path d="m21 3-8 18-3-7-7-3 18-8ZM10 14 21 3"/>',
  close:'<path d="M5 5l14 14M19 5 5 19"/>',
  calendar:'<rect x="4" y="6" width="16" height="15" rx="2"/><path d="M8 3v6M16 3v6M4 11h16"/>',
  board:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M15 4v16"/>'
};
const boardIcon = (name, extra='') => `<svg class="ui-icon ${extra}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${boardIcons[name]}</svg>`;
const statusDesign = [
  {tone:'contact', icon:'users'}, {tone:'evaluation', icon:'document'},
  {tone:'sent', icon:'send'}, {tone:'waiting', icon:'clock'},
  {tone:'approved', icon:'check'}, {tone:'rejected', icon:'close'}
];
const whatsappUrl = phone => {
  let digits = String(phone || '').replace(/\D/g,'');
  if (digits.length === 10 || digits.length === 11) digits = '55' + digits;
  return digits.length >= 12 && digits.length <= 15 ? `https://wa.me/${digits}` : '';
};
const contactIcon = kind => kind === 'whatsapp'
  ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11.5a8 8 0 0 1-11.8 7L4 20l1.5-4.2A8 8 0 1 1 20 11.5Z"/><path d="M8.7 8.2c.3-.3.6-.2.8.1l1 1.5c.2.3.1.6-.2.9l-.5.5c.6 1.2 1.5 2.1 2.7 2.7l.5-.5c.3-.3.6-.4.9-.2l1.5 1c.3.2.4.5.1.8-.6.8-1.5 1.2-2.4.9-2.5-.7-4.5-2.7-5.2-5.2-.3-.9.1-1.8.8-2.5Z"/></svg>'
  : '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/></svg>';
const contactLinks = (email, phone) => {
  const whatsapp = whatsappUrl(phone);
  const mail = String(email || '').trim();
  const validMail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail);
  return `<div class="contact-links">${whatsapp ? `<a class="whatsapp" href="${whatsapp}" target="_blank" rel="noopener noreferrer" aria-label="Abrir WhatsApp" title="Abrir WhatsApp">${contactIcon('whatsapp')}</a>` : `<span class="contact-disabled" title="Cadastre um telefone válido no autor" aria-label="WhatsApp indisponível">${contactIcon('whatsapp')}</span>`}${validMail ? `<a class="email" href="mailto:${encodeURIComponent(mail)}" aria-label="Enviar e-mail" title="Enviar e-mail">${contactIcon('email')}</a>` : `<span class="contact-disabled" title="Cadastre um e-mail válido no autor" aria-label="E-mail indisponível">${contactIcon('email')}</span>`}</div>`;
};

function folderField(name, label, current='', kind='', recordId='') {
  return `<div class="folder-field wide" data-kind="${safe(kind)}" data-record-id="${safe(recordId)}"><div class="folder-head"><span>${label}</span><div class="folder-actions"><button type="button" class="secondary folder-pick">Selecionar pasta</button><button type="button" class="plain folder-open" ${recordId && current ? '' : 'disabled'}>Abrir pasta</button></div></div><input name="${name}" type="text" readonly aria-label="${label}" value="${safe(current)}" placeholder="Nenhuma pasta selecionada" title="${safe(current)}"></div>`;
}

function bindFolderPickers() {
  document.querySelectorAll('#modal-root .folder-field').forEach(field => {
    const input = field.querySelector('input');
    const pickButton = field.querySelector('.folder-pick');
    const openButton = field.querySelector('.folder-open');
    pickButton.onclick = async () => {
      pickButton.disabled = true;
      try {
        const result = await api('/api/pick-folder', 'POST', {initial: input.value});
        if (!result.cancelled) {
          input.value = result.path;
          input.title = result.path;
          openButton.disabled = true;
          toast('Pasta selecionada. Salve o cadastro para guardar o destino.');
        }
      } catch (error) { toast(error.message, true); }
      finally { pickButton.disabled = false; }
    };
    openButton.onclick = async () => {
      try { await api('/api/open-folder', 'POST', {kind:field.dataset.kind, id:field.dataset.recordId}); }
      catch (error) { toast(error.message, true); }
    };
  });
}
let toastTimer;

function toast(message, isError=false) {
  const element = el('#toast');
  element.textContent = message;
  element.className = isError ? 'error' : '';
  element.style.display = 'block';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.style.display='none', 4500);
}

async function api(path, method='GET', payload) {
  const response = await fetch(path, {
    method,
    headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},
    body: payload === undefined ? undefined : JSON.stringify(payload)
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Não foi possível salvar.');
  return result;
}

async function load() {
  const [result, authors, options] = await Promise.all([api('/api/proposals'), api('/api/authors'), api('/api/options')]);
  if (result.api_version !== 6) {
    el('#version-alert').hidden = false;
    throw new Error('Reinicie o programa para ativar a gravação da prioridade.');
  }
  el('#version-alert').hidden = true;
  appState.statuses = result.statuses;
  appState.proposals = result.proposals;
  appState.authors = authors.authors;
  appState.options = options;
  render();
}

function render() {
  const records = appState.proposals;
  const awaiting = records.filter(item => /aguardando/i.test(item.status)).length;
  const approved = records.filter(item => /aprovad/i.test(item.status)).length;
  el('#summary').innerHTML = [
    ['Livros cadastrados', records.length, 'book', 'contact'],
    ['No quadro', records.filter(item => !/aprovad|recusad/i.test(item.status)).length, 'document', 'evaluation'],
    ['Aguardando retorno', awaiting, 'clock', 'waiting'],
    ['Aprovados', approved, 'check', 'approved'],
  ].map(([label,number,icon,tone]) => `<div class="summary-card"><span class="summary-icon tone-${tone}">${boardIcon(icon)}</span><span class="summary-copy"><small>${label}</small><strong>${number}</strong></span></div>`).join('');
  const query = appState.search.trim().toLocaleLowerCase('pt-BR');
  const shown = records.filter(item => !query || `${item.title} ${item.display_author}`.toLocaleLowerCase('pt-BR').includes(query));
  const byPriority = (a,b) => priorityRank(a.priority) - priorityRank(b.priority);
  el('#board').innerHTML = appState.statuses.map((status,index) => {
    const cards = shown.filter(item => item.status === status).sort(byPriority);
    const design = statusDesign[index] || statusDesign[0];
    return `<section class="lane tone-${design.tone}" data-status="${safe(status)}"><div class="lane-head"><span class="lane-icon">${boardIcon(design.icon)}</span><span class="lane-title">${safe(status)}</span><b>${cards.length}</b></div><div class="cards" data-status="${safe(status)}">${cards.map(cardHtml).join('')}${cards.length ? '' : `<div class="lane-empty"><span class="empty-icon">${boardIcon(design.icon)}</span><strong>${query ? 'Nenhum resultado' : 'Nenhuma proposta neste status.'}</strong><span>${query ? 'Tente outra busca.' : 'Arraste um livro para cá ao mudar o status.'}</span></div>`}</div></section>`;
  }).join('');
  el('#proposal-list').innerHTML = shown.length ? `<div class="list-header"><span>Livro</span><span>Autor</span><span>Status</span><span>Prioridade</span><span>Atualizado</span></div>${[...shown].sort(byPriority).map(item => {
    const design = statusDesign[appState.statuses.indexOf(item.status)] || statusDesign[0];
    return `<button type="button" class="proposal-list-row tone-${design.tone}" data-id="${safe(item.id)}"><strong>${safe(item.title)}</strong><span>${safe(item.display_author)}</span><span><span class="status-pill">${boardIcon(design.icon)}${safe(item.status)}</span></span><span><b class="priority-badge ${priorityClass(item.priority)}">${safe(priorityText(item.priority || 'A definir'))}</b></span><time>${dateLabel(item.updated_at)}</time></button>`;
  }).join('')}` : '<div class="authors-empty">Nenhuma proposta encontrada.</div>';
  el('#board').hidden = appState.proposalDisplay !== 'kanban';
  el('#proposal-list').hidden = appState.proposalDisplay !== 'list';
  el('#proposal-view-title').textContent = appState.proposalDisplay === 'kanban' ? 'Quadro de propostas' : 'Lista de propostas';
  el('#proposal-view-hint').textContent = appState.proposalDisplay === 'kanban' ? 'Arraste para mudar o status. Em cada coluna, os livros ficam ordenados por prioridade.' : 'Livros ordenados por prioridade. Clique para editar.';
  for (const button of document.querySelectorAll('.proposal-list-row')) button.onclick = () => openForm(button.dataset.id);
  for (const card of document.querySelectorAll('.proposal-card')) {
    card.addEventListener('click', () => { if (Date.now() > appState.suppressClickUntil) openForm(card.dataset.id); });
    card.addEventListener('dragstart', dragStart);
    card.addEventListener('dragend', dragEnd);
  }
  for (const column of document.querySelectorAll('.cards')) {
    column.addEventListener('dragover', dragOver);
    column.addEventListener('drop', drop);
    column.addEventListener('dragleave', event => {
      if (!column.contains(event.relatedTarget)) column.parentElement.classList.remove('drop-hint');
    });
  }
  if (appState.proposalDisplay === 'kanban') {
    for (const column of document.querySelectorAll('.cards')) {
      const cards = [...column.querySelectorAll('.proposal-card')];
      if (cards.length > 4) {
        const visibleHeight = cards.slice(0,4).reduce((height, card) =>
          height + card.offsetHeight + parseFloat(getComputedStyle(card).marginBottom || '0'), 8);
        column.style.height = `${Math.ceil(visibleHeight)}px`;
      }
    }
  }
  renderAuthors();
}

function cardHtml(item) {
  const specs = [item.book_format, item.printing, item.pages ? `${item.pages} págs.` : ''].filter(Boolean);
  return `<article class="proposal-card" draggable="${appState.search ? 'false' : 'true'}" data-id="${safe(item.id)}" tabindex="0" role="button" aria-label="Editar ${safe(item.title)}"><div class="card-top"><div class="card-title" title="${safe(item.title)}">${safe(item.title)}</div><span class="priority-badge ${priorityClass(item.priority)}">${safe(priorityText(item.priority || 'A definir'))}</span></div><div class="card-author">${safe(item.display_author)}</div>${specs.length ? `<div class="card-specs">${specs.map(spec => `<span>${safe(spec)}</span>`).join('')}</div>` : ''}<div class="card-bottom"><span class="tag">${boardIcon('document')} Dados iniciais</span><span class="card-date">${boardIcon('calendar')}${dateLabel(item.updated_at)}</span></div></article>`;
}

function renderAuthors() {
  const query = appState.authorSearch.trim().toLocaleLowerCase('pt-BR');
  const authors = appState.authors.filter(item => !query || `${item.name} ${item.email} ${item.phone}`.toLocaleLowerCase('pt-BR').includes(query));
  el('#authors-list').innerHTML = authors.length ? authors.map(item => `<button class="author-row" data-id="${safe(item.id)}"><span class="author-avatar">${safe(item.name.slice(0,1).toUpperCase())}</span><span class="author-info"><strong>${safe(item.name)}</strong><small>${safe([item.email,item.phone].filter(Boolean).join(' · ') || 'Contato não informado')}</small></span><span class="author-count">${item.proposal_count} ${item.proposal_count === 1 ? 'proposta' : 'propostas'}</span><span class="author-arrow">›</span></button>`).join('') : `<div class="authors-empty">${query ? 'Nenhum autor encontrado.' : 'Nenhum autor cadastrado. Cadastre o primeiro autor para começar.'}</div>`;
  for (const row of document.querySelectorAll('.author-row')) row.onclick = () => openAuthorForm(row.dataset.id);
}

function switchView(view) {
  appState.view = view;
  const authors = view === 'authors';
  el('#proposals-view').hidden = authors;
  el('#authors-view').hidden = !authors;
  el('#new-book-top').hidden = authors;
  el('#new-author-top').hidden = !authors;
  el('#section-label').textContent = authors ? 'AUTORES' : 'PROPOSTAS';
  el('#page-title').textContent = authors ? 'Autores' : 'Propostas';
  el('#page-description').textContent = authors ? 'Consulte os autores cadastrados e mantenha os contatos atualizados.' : 'Cadastre livros e acompanhe cada contato até a resposta do autor.';
  document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('nav-active', button.dataset.view === view));
}

function dragStart(event) {
  if (appState.search) {
    event.preventDefault();
    toast('Limpe a busca para organizar o quadro.', true);
    return;
  }
  appState.draggingId = event.currentTarget.dataset.id;
  appState.dropStarted = false;
  appState.suppressClickUntil = Date.now() + 500;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', appState.draggingId);
  requestAnimationFrame(() => event.currentTarget.classList.add('dragging'));
}

function dragOver(event) {
  if (!appState.draggingId) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  const column = event.currentTarget;
  column.parentElement.classList.add('drop-hint');
  const moving = document.querySelector(`.proposal-card[data-id="${appState.draggingId}"]`);
  const hovered = event.target.closest('.proposal-card');
  if (!moving || !hovered || hovered === moving || !column.contains(hovered)) {
    if (moving && !hovered) {
      column.querySelector('.lane-empty')?.remove();
      column.appendChild(moving);
    }
    return;
  }
  const half = hovered.getBoundingClientRect().top + hovered.getBoundingClientRect().height / 2;
  column.insertBefore(moving, event.clientY < half ? hovered : hovered.nextSibling);
}

async function drop(event) {
  event.preventDefault();
  if (!appState.draggingId) return;
  appState.dropStarted = true;
  const column = event.currentTarget;
  const id = appState.draggingId;
  const status = column.dataset.status;
  const order = [...column.querySelectorAll('.proposal-card')].map(card => card.dataset.id);
  appState.draggingId = null;
  try {
    await api('/api/move','POST',{id,status,order});
    toast('Status atualizado.');
  } catch (error) {
    toast(error.message,true);
  }
  await load();
  appState.dropStarted = false;
}

function dragEnd() {
  appState.suppressClickUntil = Date.now() + 250;
  document.querySelectorAll('.drop-hint').forEach(lane => lane.classList.remove('drop-hint'));
  if (!appState.dropStarted) {
    appState.draggingId = null;
    render();
  }
}

function openForm(id=null) {
  const item = id ? appState.proposals.find(record => record.id === id) : null;
  if (id && !item) return;
  const selected = key => safe(item?.[key] ?? '');
  el('#modal-root').innerHTML = `<div class="modal-backdrop"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="form-title"><div class="modal-header"><div><small>${item ? 'EDITAR LIVRO' : 'NOVO LIVRO'}</small><h2 id="form-title">${item ? safe(item.title) : 'Cadastrar proposta'}</h2></div><button type="button" class="close" id="close-modal" aria-label="Fechar">×</button></div><form id="proposal-form" class="fields"><label class="wide">Título do livro <span class="required">*</span><input name="title" maxlength="240" required value="${selected('title')}" autofocus></label><div class="author-picker wide"><label>Autor <span class="required">*</span><input id="author-lookup" type="search" autocomplete="off" placeholder="Pesquisar autor cadastrado" value="${safe(item?.display_author || '')}"></label><input id="selected-author-id" type="hidden" value="${safe(item?.author_id || '')}"><div id="author-options" class="author-options" hidden></div><button type="button" id="new-author-inline" class="text-button">+ Cadastrar novo autor</button><div id="new-author-fields" class="inline-author" hidden><label>Nome do autor <span class="required">*</span><input name="new_author_name" maxlength="240"></label><label>E-mail<input type="email" name="new_author_email" maxlength="240"></label><label>WhatsApp / telefone<input name="new_author_phone" maxlength="240"></label></div></div><label>Formato<select name="book_format">${['','14x21 cm','16x23 cm','17x24 cm','Outro'].map(value => `<option value="${value}" ${item?.book_format===value?'selected':''}>${value || 'A definir'}</option>`).join('')}</select></label><label>Páginas<input type="number" name="pages" min="1" max="5000" value="${selected('pages')}"></label><label>Dificuldade<select name="difficulty">${['','Fácil','Média','Difícil'].map(value => `<option value="${value}" ${item?.difficulty===value?'selected':''}>${value || 'A avaliar'}</option>`).join('')}</select></label><label>Status<select name="status">${appState.statuses.map(value => `<option value="${safe(value)}" ${(item?.status || appState.statuses[0])===value?'selected':''}>${safe(value)}</option>`).join('')}</select></label><label class="wide">Observações<textarea name="notes" maxlength="4000" placeholder="Informações importantes para acompanhar a proposta">${selected('notes')}</textarea></label><div class="modal-actions wide"><button type="button" class="plain" id="cancel-modal">Cancelar</button><button type="submit" class="primary">${item ? 'Salvar alterações' : 'Cadastrar livro'}</button></div></form></div></div>`;
  const formatLabel = el('#proposal-form [name="book_format"]').closest('label');
  formatLabel.outerHTML = catalogField('book_format', 'Formato', item?.book_format || '');
  el('#proposal-form [name="pages"]').closest('label').insertAdjacentHTML('beforebegin',
    catalogField('cover_type', 'Tipo de capa', item?.cover_type || '') +
    `<label>Impressão<select name="printing"><option value="">A definir</option><option value="P&amp;B" ${item?.printing === 'P&B' ? 'selected' : ''}>P&amp;B</option><option value="Colorido" ${item?.printing === 'Colorido' ? 'selected' : ''}>Colorido</option></select></label>`);
  const difficulty = el('#proposal-form [name="difficulty"]');
  const currentDifficulty = item?.difficulty || '';
  difficulty.innerHTML = `<option value="">A avaliar</option>${Array.from({length:10}, (_,index) => {
    const level = String(index + 1);
    return `<option value="${level}" ${currentDifficulty === level ? 'selected' : ''}>Nível ${level}</option>`;
  }).join('')}${currentDifficulty && !/^(10|[1-9])$/.test(currentDifficulty) ? `<option value="${safe(currentDifficulty)}" selected>${safe(currentDifficulty)} (valor anterior)</option>` : ''}`;
  el('#proposal-form').insertAdjacentHTML('afterbegin', `<input type="hidden" name="priority" value="${safe(item?.priority || '')}">`);
  el('.modal-header .close').insertAdjacentHTML('beforebegin', `<label class="header-priority">Prioridade<select id="priority-select" class="${priorityClass(item?.priority)}"><option value="">A definir</option>${['Baixo','Médio','Alto','Urgente','Extremo'].map(value => `<option value="${value}" ${item?.priority === value ? 'selected' : ''}>${safe(priorityText(value))}</option>`).join('')}</select></label>`);
  el('.modal-header').classList.add('proposal-modal-header');
  el('#priority-select').onchange = event => {
    el('#proposal-form [name="priority"]').value = event.target.value;
    event.target.className = priorityClass(event.target.value);
  };
  const authorPicker = el('#proposal-form .author-picker');
  const authorLabel = authorPicker.querySelector('label');
  const authorInput = authorLabel.querySelector('input');
  authorLabel.innerHTML = '';
  authorInput.setAttribute('aria-label', 'Autor');
  authorLabel.appendChild(authorInput);
  authorPicker.insertAdjacentHTML('afterbegin', `<div class="author-title-row"><span>Autor <span class="required">*</span></span><div id="proposal-contact-links">${item ? contactLinks(item.author_email, item.author_phone) : ''}</div></div>`);
  authorPicker.insertAdjacentHTML('afterend', folderField('folder_path', 'Pasta do livro', item?.folder_path || '', 'proposal', id || ''));
  el('#new-author-fields').insertAdjacentHTML('beforeend', folderField('new_author_folder_path', 'Pasta do novo autor'));
  bindFolderPickers();
  for (const kind of ['book_format','cover_type']) {
    const select = el(`#proposal-form [name="${kind}"]`);
    const custom = el(`#proposal-form [name="custom_${kind}"]`);
    select.onchange = () => {
      custom.hidden = select.value !== '__custom__';
      custom.required = !custom.hidden;
      if (!custom.hidden) custom.focus();
    };
  }
  const backdrop = el('.modal-backdrop');
  backdrop.addEventListener('click', event => { if (event.target === backdrop) closeForm(); });
  el('#close-modal').onclick = closeForm;
  el('#cancel-modal').onclick = closeForm;
  el('#proposal-form').onsubmit = event => saveForm(event,id);
  const lookup = el('#author-lookup');
  const options = el('#author-options');
  function showOptions() {
    const query = lookup.value.trim().toLocaleLowerCase('pt-BR');
    const matches = appState.authors.filter(author => !query || author.name.toLocaleLowerCase('pt-BR').includes(query) || author.email.toLocaleLowerCase('pt-BR').includes(query)).slice(0,8);
    options.innerHTML = matches.length ? matches.map(author => `<button type="button" class="author-option" data-id="${safe(author.id)}"><strong>${safe(author.name)}</strong><small>${safe(author.email || author.phone || 'Contato não informado')}</small></button>`).join('') : '<div class="option-empty">Nenhum autor encontrado. Use “Cadastrar novo autor”.</div>';
    options.hidden = false;
    options.querySelectorAll('.author-option').forEach(button => button.onclick = () => {
      const author = appState.authors.find(row => row.id === button.dataset.id);
      lookup.value = author.name;
      el('#selected-author-id').value = author.id;
      el('#proposal-contact-links').innerHTML = contactLinks(author.email, author.phone);
      options.hidden = true;
    });
  }
  lookup.onfocus = showOptions;
  lookup.oninput = () => { el('#selected-author-id').value = ''; el('#proposal-contact-links').innerHTML = ''; showOptions(); };
  el('#new-author-inline').onclick = () => {
    const fields = el('#new-author-fields');
    fields.hidden = !fields.hidden;
    el('#new-author-inline').textContent = fields.hidden ? '+ Cadastrar novo autor' : 'Usar autor cadastrado';
    options.hidden = true;
    if (!fields.hidden) { fields.querySelector('[name="new_author_name"]').value = lookup.value; fields.querySelector('[name="new_author_name"]').focus(); }
  };
  el('#proposal-form [name="title"]').focus();
}

function catalogField(kind, label, current) {
  const options = appState.options[kind] || [];
  const known = !current || options.includes(current);
  return `<div class="catalog-field"><label>${label}<select name="${kind}"><option value="">A definir</option>${options.map(value => `<option value="${safe(value)}" ${current === value ? 'selected' : ''}>${safe(value)}</option>`).join('')}<option value="__custom__" ${known ? '' : 'selected'}>+ Cadastrar outro</option></select></label><input class="catalog-custom" name="custom_${kind}" maxlength="240" placeholder="Digite a nova opção" value="${known ? '' : safe(current)}" ${known ? 'hidden' : 'required'}></div>`;
}

function closeForm() { el('#modal-root').innerHTML = ''; }

async function saveForm(event,id) {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
  for (const kind of ['book_format','cover_type']) {
    if (payload[kind] === '__custom__') payload[kind] = payload[`custom_${kind}`]?.trim() || '';
    delete payload[`custom_${kind}`];
  }
  const creatingAuthor = !el('#new-author-fields').hidden;
  if (creatingAuthor) {
    payload.new_author = {name:payload.new_author_name, email:payload.new_author_email,
      phone:payload.new_author_phone, folder_path:payload.new_author_folder_path};
  } else {
    payload.author_id = el('#selected-author-id').value;
    if (!payload.author_id) { toast('Selecione um autor da lista ou cadastre um novo.',true); el('#author-lookup').focus(); return; }
  }
  delete payload.new_author_name;
  delete payload.new_author_email;
  delete payload.new_author_phone;
  delete payload.new_author_folder_path;
  payload.pages = payload.pages ? Number(payload.pages) : null;
  try {
    let savedId = id;
    if (id) await api(`/api/proposals/${id}`,'PATCH',payload);
    else savedId = (await api('/api/proposals','POST',payload)).id;
    closeForm();
    await load();
    if (appState.proposals.find(row => row.id === savedId)?.priority !== payload.priority) {
      throw new Error('A prioridade não foi gravada. Feche e reinicie o programa antes de tentar novamente.');
    }
    toast(id ? 'Livro atualizado.' : 'Livro cadastrado.');
  } catch (error) { toast(error.message,true); }
}

function openAuthorForm(id=null) {
  const author = id ? appState.authors.find(row => row.id === id) : null;
  if (id && !author) return;
  const books = author ? appState.proposals.filter(row => row.author_id === author.id).sort((a,b) => a.title.localeCompare(b.title, 'pt-BR')) : [];
  const value = key => safe(author?.[key] ?? '');
  el('#modal-root').innerHTML = `<div class="modal-backdrop"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="author-form-title"><div class="modal-header"><div><small>${author ? 'EDITAR AUTOR' : 'NOVO AUTOR'}</small><h2 id="author-form-title">${author ? safe(author.name) : 'Cadastrar autor'}</h2></div><button type="button" class="close" id="close-modal" aria-label="Fechar">×</button></div><form id="author-form" class="fields"><label class="wide">Nome do autor <span class="required">*</span><input name="name" required maxlength="240" value="${value('name')}"></label><label>E-mail<input type="email" name="email" maxlength="240" value="${value('email')}"></label><label>WhatsApp / telefone<input name="phone" maxlength="240" value="${value('phone')}"></label><label class="wide">Observações<textarea name="notes" maxlength="4000">${value('notes')}</textarea></label><div class="modal-actions wide"><button type="button" class="plain" id="cancel-modal">Cancelar</button><button type="submit" class="primary">${author ? 'Salvar alterações' : 'Cadastrar autor'}</button></div></form></div></div>`;
  el('#author-form [name="notes"]').closest('label').insertAdjacentHTML('beforebegin',
    folderField('folder_path', 'Pasta do autor', author?.folder_path || '', 'author', id || ''));
  bindFolderPickers();
  if (author) {
    const closeButton = el('#close-modal');
    const actions = document.createElement('div');
    actions.className = 'author-header-actions';
    closeButton.before(actions);
    actions.appendChild(closeButton);
    actions.insertAdjacentHTML('afterbegin', `<button type="button" id="author-books-toggle" class="author-books-toggle">${books.length} ${books.length === 1 ? 'livro' : 'livros'} <span>›</span></button>`);
    el('#author-books-toggle').onclick = () => openAuthorBooks(author.id);
    el('.modal-header').insertAdjacentHTML('afterend', contactLinks(author.email, author.phone));
  }
  const backdrop = el('.modal-backdrop');
  backdrop.onclick = event => { if (event.target === backdrop) closeForm(); };
  el('#close-modal').onclick = closeForm;
  el('#cancel-modal').onclick = closeForm;
  el('#author-form').onsubmit = async event => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      if (id) await api(`/api/authors/${id}`,'PATCH',payload);
      else await api('/api/authors','POST',payload);
      closeForm();
      await load();
      toast(id ? 'Autor atualizado.' : 'Autor cadastrado.');
    } catch (error) { toast(error.message,true); }
  };
  el('#author-form [name="name"]').focus();
}

function openAuthorBooks(authorId) {
  const author = appState.authors.find(row => row.id === authorId);
  if (!author) return;
  const books = appState.proposals.filter(row => row.author_id === authorId).sort((a,b) =>
    priorityRank(a.priority) - priorityRank(b.priority) || a.title.localeCompare(b.title, 'pt-BR'));
  el('#modal-root').innerHTML = `<div class="modal-backdrop"><div class="modal author-books-modal" role="dialog" aria-modal="true" aria-labelledby="author-books-title"><div class="modal-header"><div><small>LIVROS DO AUTOR</small><h2 id="author-books-title">${safe(author.name)}</h2></div><button type="button" class="close" id="close-modal" aria-label="Fechar">×</button></div><p class="books-count">${books.length} ${books.length === 1 ? 'livro vinculado' : 'livros vinculados'}</p><div class="author-books-list">${books.length ? books.map(book => `<button type="button" class="author-book-link" data-id="${safe(book.id)}"><strong>${safe(book.title)}</strong><small>${safe(book.status)}</small></button>`).join('') : '<p>Nenhum livro vinculado a este autor.</p>'}</div><div class="modal-actions"><button type="button" class="plain" id="back-to-author">← Voltar ao autor</button></div></div></div>`;
  const backdrop = el('.modal-backdrop');
  backdrop.onclick = event => { if (event.target === backdrop) closeForm(); };
  el('#close-modal').onclick = closeForm;
  el('#back-to-author').onclick = () => openAuthorForm(authorId);
  el('.author-books-list').querySelectorAll('.author-book-link').forEach(button => button.onclick = () => {
    appState.search = '';
    el('#search').value = '';
    switchView('proposals');
    render();
    openForm(button.dataset.id);
  });
}

document.querySelector('#new-book').onclick = () => openForm();
document.querySelector('#new-book-top').onclick = () => openForm();
document.querySelector('#show-kanban').onclick = () => setProposalDisplay('kanban');
document.querySelector('#show-list').onclick = () => setProposalDisplay('list');
document.querySelector('#new-author-top').onclick = () => openAuthorForm();
document.querySelector('#new-author').onclick = () => openAuthorForm();
document.querySelector('#author-search').oninput = event => {appState.authorSearch = event.target.value; renderAuthors();};
document.querySelectorAll('.nav-item').forEach(button => button.onclick = () => switchView(button.dataset.view));
document.querySelector('#search').oninput = event => {appState.search = event.target.value; render();};
let quickSearchSelection = 0;
let quickSearchResults = [];
let quickSearchReturnFocus = null;

function closeQuickSearch() {
  if (!el('#quick-search-root').firstChild) return;
  el('#quick-search-root').replaceChildren();
  quickSearchReturnFocus?.focus();
  quickSearchReturnFocus = null;
}

function quickSearchMatches(query) {
  const term = query.trim().toLocaleLowerCase('pt-BR');
  const books = appState.proposals.filter(item => !term || `${item.title} ${item.display_author}`.toLocaleLowerCase('pt-BR').includes(term))
    .sort((a,b) => priorityRank(a.priority) - priorityRank(b.priority))
    .map(item => ({kind:'book', id:item.id, title:item.title, detail:`${item.display_author} · ${item.status}`}));
  const authors = appState.authors.filter(item => !term || `${item.name} ${item.email || ''} ${item.phone || ''}`.toLocaleLowerCase('pt-BR').includes(term))
    .sort((a,b) => a.name.localeCompare(b.name, 'pt-BR'))
    .map(item => ({kind:'author', id:item.id, title:item.name, detail:'Autor cadastrado'}));
  return [...books, ...authors].slice(0, 8);
}

function renderQuickSearchResults() {
  const query = el('#quick-search-input').value;
  quickSearchResults = quickSearchMatches(query);
  quickSearchSelection = Math.min(quickSearchSelection, Math.max(quickSearchResults.length - 1, 0));
  el('#quick-search-results').innerHTML = quickSearchResults.length
    ? quickSearchResults.map((item,index) => `<button type="button" class="quick-search-result${index === quickSearchSelection ? ' selected' : ''}" data-index="${index}" role="option" aria-selected="${index === quickSearchSelection}"><span class="quick-search-result-icon">${item.kind === 'book' ? boardIcon('book') : boardIcon('users')}</span><span class="quick-search-result-copy"><strong>${safe(item.title)}</strong><small>${safe(item.detail)}</small></span><span class="quick-search-result-type">${item.kind === 'book' ? 'Livro' : 'Autor'}</span></button>`).join('')
    : '<p class="quick-search-empty">Nenhum livro ou autor encontrado.</p>';
  el('#quick-search-results').querySelectorAll('button').forEach(button => button.onclick = () => selectQuickSearchResult(Number(button.dataset.index)));
}

function selectQuickSearchResult(index) {
  const item = quickSearchResults[index];
  if (!item) return;
  closeQuickSearch();
  closeForm();
  if (item.kind === 'book') {
    appState.search = '';
    el('#search').value = '';
    switchView('proposals');
    render();
    openForm(item.id);
  } else {
    appState.authorSearch = '';
    el('#author-search').value = '';
    switchView('authors');
    renderAuthors();
    openAuthorForm(item.id);
  }
}

function openQuickSearch() {
  if (el('#quick-search-root').firstChild) { el('#quick-search-input').focus(); return; }
  quickSearchReturnFocus = document.activeElement;
  quickSearchSelection = 0;
  el('#quick-search-root').innerHTML = `<div class="quick-search-backdrop"><div class="quick-search-dialog" role="dialog" aria-modal="true" aria-label="Busca rápida"><div class="quick-search-input-row"><span aria-hidden="true">⌕</span><input id="quick-search-input" type="search" autocomplete="off" placeholder="Buscar livros ou autores..." aria-label="Buscar livros ou autores"><kbd>Esc</kbd></div><div id="quick-search-results" class="quick-search-results" role="listbox" aria-label="Resultados da busca"></div><div class="quick-search-footer"><span>↑ ↓ navegar</span><span>↵ abrir</span><span>Esc fechar</span></div></div></div>`;
  const backdrop = el('.quick-search-backdrop');
  backdrop.onclick = event => { if (event.target === backdrop) closeQuickSearch(); };
  const input = el('#quick-search-input');
  input.oninput = () => { quickSearchSelection = 0; renderQuickSearchResults(); };
  input.onkeydown = event => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!quickSearchResults.length) return;
      quickSearchSelection = (quickSearchSelection + (event.key === 'ArrowDown' ? 1 : -1) + quickSearchResults.length) % quickSearchResults.length;
      renderQuickSearchResults();
      el('.quick-search-result.selected')?.scrollIntoView({block:'nearest'});
    } else if (event.key === 'Enter') {
      event.preventDefault();
      selectQuickSearchResult(quickSearchSelection);
    }
  };
  renderQuickSearchResults();
  input.focus();
}

if (/Mac|iPhone|iPad/.test(navigator.platform)) {
  document.querySelectorAll('.search-shortcut').forEach(hint => hint.textContent = '⌘ K');
}
document.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    openQuickSearch();
    return;
  }
  if (event.key === 'Escape' && el('#quick-search-root').firstChild) { closeQuickSearch(); return; }
  if (event.key === 'Escape') closeForm();
  if (event.key === 'Enter' && event.target.classList?.contains('proposal-card')) openForm(event.target.dataset.id);
});
load().catch(error => toast('Não foi possível carregar o quadro: '+error.message,true));

function setProposalDisplay(display) {
  appState.proposalDisplay = display;
  for (const [id, mode] of [['#show-kanban','kanban'],['#show-list','list']]) {
    el(id).classList.toggle('view-active', display === mode);
    el(id).setAttribute('aria-pressed', String(display === mode));
  }
  render();
}
