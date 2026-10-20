import { supabase } from '../assets/js/supabase.js';

// ─────────────────────────────────────────────────────────────
// Utilidades
// ─────────────────────────────────────────────────────────────

const $ = (sel, raiz = document) => raiz.querySelector(sel);
const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function avisar(texto, erro = false) {
  const el = $('#aviso');
  el.textContent = texto;
  el.classList.toggle('erro', erro);
  el.classList.add('visivel');
  clearTimeout(avisar.t);
  avisar.t = setTimeout(() => el.classList.remove('visivel'), 3200);
}

function falhou(error, contexto) {
  if (!error) return false;
  console.error(contexto, error);
  avisar(`${contexto}: ${error.message}`, true);
  return true;
}

// Caminhos relativos ("conteudos/x.pdf") são relativos à raiz do site, não a /area/
const RAIZ_SITE = new URL('../', location.href);
const urlDoSite = u => (u ? new URL(u, RAIZ_SITE).href : '');

const DIAS = {
  seg: { rotulo: 'Segunda', pilar: 'Economista', cor: 'salvia', offset: 0 },
  qua: { rotulo: 'Quarta', pilar: 'Paper', cor: 'terracota', offset: 2 },
  sex: { rotulo: 'Sexta', pilar: 'História', cor: 'areia', offset: 4 },
};

const ORDEM_DIA = { seg: 0, qua: 1, sex: 2 };
const porSemanaEDia = (a, b) => a.semana - b.semana || ORDEM_DIA[a.dia] - ORDEM_DIA[b.dia];

const STATUS = {
  ideia: 'Ideia',
  roteiro: 'Roteiro pronto',
  gravado: 'Gravado',
  editado: 'Editado',
  publicado: 'Publicado',
};

const formatarData = d => (d ? new Date(`${d}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', weekday: 'short' }) : '');
const hojeISO = () => new Date().toLocaleDateString('sv-SE');

// Elisa não usa travessões: ajudamos a encontrar e trocar
const TEM_TRAVESSAO = /[—–]/;
const trocarTravessoes = t => t.replace(/\s*[—–]\s*/g, ', ');

// Nome de arquivo seguro para o Storage
function nomeSeguro(nome) {
  const ponto = nome.lastIndexOf('.');
  const base = ponto > 0 ? nome.slice(0, ponto) : nome;
  const ext = ponto > 0 ? nome.slice(ponto).toLowerCase() : '';
  const limpo = base.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'arquivo';
  return limpo + ext.replace(/[^a-z0-9.]/g, '');
}

function abrirDialogo(html, aoMontar) {
  const d = $('#dialogo');
  d.innerHTML = html;
  d.showModal();
  $$('[data-fechar]', d).forEach(b => b.addEventListener('click', () => d.close()));
  aoMontar?.(d);
  return d;
}

// ─────────────────────────────────────────────────────────────
// Autenticação
// ─────────────────────────────────────────────────────────────

async function iniciar() {
  if (!supabase) {
    $('#tela-config').hidden = false;
    return;
  }
  const { data: { session } } = await supabase.auth.getSession();
  if (session) await entrar();
  else mostrarLogin();

  supabase.auth.onAuthStateChange((evento) => {
    if (evento === 'SIGNED_OUT') mostrarLogin();
  });
}

function mostrarLogin(msg = '') {
  $('#app').hidden = true;
  $('#tela-login').hidden = false;
  $('#login-msg').textContent = msg;
}

$('#form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const botao = $('button', f);
  botao.disabled = true;
  $('#login-msg').textContent = '';
  const { error } = await supabase.auth.signInWithPassword({ email: f.email.value.trim(), password: f.senha.value });
  botao.disabled = false;
  if (error) {
    $('#login-msg').textContent = 'E-mail ou senha incorretos.';
    return;
  }
  f.reset();
  await entrar();
});

$('#btn-sair').addEventListener('click', () => supabase.auth.signOut());

async function entrar() {
  const { data: ehAdmin, error } = await supabase.rpc('is_admin');
  if (error || !ehAdmin) {
    await supabase.auth.signOut();
    mostrarLogin('Esta conta não tem acesso ao estúdio.');
    return;
  }
  $('#tela-login').hidden = true;
  $('#app').hidden = false;
  rotear();
}

// ─────────────────────────────────────────────────────────────
// Rotas
// ─────────────────────────────────────────────────────────────

const ROTAS = {
  painel: telaPainel,
  cronograma: telaCronograma,
  documentos: telaDocumentos,
  conteudos: telaConteudos,
  identidade: telaIdentidade,
};

function rotear() {
  if ($('#app').hidden) return;
  const rota = location.hash.slice(1).split('/')[0] || 'painel';
  const tela = ROTAS[rota] || telaPainel;
  $$('#menu a').forEach(a => a.classList.toggle('ativo', a.dataset.rota === rota));
  // Troca o <main> a cada tela para não acumular eventos das telas anteriores
  const antigo = $('#conteudo');
  const main = antigo.cloneNode(false);
  antigo.replaceWith(main);
  main.innerHTML = '<p class="carregando">Carregando…</p>';
  tela(main);
  main.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', rotear);

// ─────────────────────────────────────────────────────────────
// Visão geral
// ─────────────────────────────────────────────────────────────

async function telaPainel(main) {
  const [{ data: eps, error }, { count: nConteudos }] = await Promise.all([
    supabase.from('episodios').select('id, semana, dia, titulo, status, data_publicacao'),
    supabase.from('conteudos').select('id', { count: 'exact', head: true }).eq('publicado', true),
  ]);
  if (falhou(error, 'Erro ao carregar episódios')) return;
  eps.sort(porSemanaEDia);

  const total = eps.length;
  const porStatus = Object.fromEntries(Object.keys(STATUS).map(s => [s, eps.filter(e => e.status === s).length]));
  const hoje = hojeISO();
  const proximos = eps
    .filter(e => e.data_publicacao && e.data_publicacao >= hoje && e.status !== 'publicado')
    .sort((a, b) => a.data_publicacao.localeCompare(b.data_publicacao))
    .slice(0, 6);
  const atrasados = eps.filter(e => e.data_publicacao && e.data_publicacao < hoje && e.status !== 'publicado');
  const semRoteiro = eps.filter(e => e.status === 'ideia').slice(0, 6);

  main.innerHTML = `
    <header class="cabecalho">
      <p class="mono">Visão geral</p>
      <h1>Olá, <em>Elisa</em>.</h1>
    </header>

    <div class="metricas">
      ${Object.entries(STATUS).map(([s, r]) => `
        <div class="metrica status-${s}">
          <strong>${porStatus[s]}</strong><span>${r}</span>
        </div>`).join('')}
      <div class="metrica"><strong>${nConteudos ?? 0}</strong><span>Conteúdos no site</span></div>
    </div>

    <div class="barra-progresso" title="${porStatus.publicado} de ${total} publicados">
      ${Object.keys(STATUS).map(s => `<span class="status-${s}" style="flex:${porStatus[s]}"></span>`).join('')}
    </div>

    <div class="grade-2">
      <section class="painel-bloco">
        <h2>Próximas publicações</h2>
        ${proximos.length ? listaCurta(proximos) : `<p class="vazio">Nenhuma data marcada ainda. No <a href="#cronograma">cronograma</a>, use "Distribuir datas" para preencher o calendário de uma vez.</p>`}
        ${atrasados.length ? `<p class="alerta">${atrasados.length} episódio(s) com data passada e ainda não publicados.</p>` : ''}
      </section>
      <section class="painel-bloco">
        <h2>Próximos roteiros a escrever</h2>
        ${semRoteiro.length ? listaCurta(semRoteiro) : '<p class="vazio">Todos os roteiros estão escritos.</p>'}
      </section>
    </div>`;
}

function listaCurta(eps) {
  return `<ul class="lista-curta">${eps.map(e => `
    <li>
      <a href="#cronograma/${e.id}">
        <span class="selo cor-${DIAS[e.dia].cor}">${DIAS[e.dia].rotulo.slice(0, 3)}</span>
        <span class="lista-titulo">${esc(e.titulo)}</span>
        <span class="mono">${e.data_publicacao ? formatarData(e.data_publicacao) : `Sem. ${e.semana}`}</span>
      </a>
    </li>`).join('')}</ul>`;
}

// ─────────────────────────────────────────────────────────────
// Cronograma
// ─────────────────────────────────────────────────────────────

let filtroMes = 'todos';
let filtroStatus = 'todos';

async function telaCronograma(main) {
  const { data: eps, error } = await supabase.from('episodios').select('*').order('semana');
  if (falhou(error, 'Erro ao carregar o cronograma')) return;
  eps.sort(porSemanaEDia);

  const meses = [...new Map(eps.map(e => [e.mes, e.tema_mes])).entries()];

  main.innerHTML = `
    <header class="cabecalho cabecalho-acoes">
      <div>
        <p class="mono">Cronograma de postagens</p>
        <h1>${eps.length} episódios, <em>${meses.length} meses</em></h1>
      </div>
      <div class="acoes">
        <button class="btn btn-leve" id="btn-datas" type="button">Distribuir datas</button>
        <button class="btn btn-primario" id="btn-novo" type="button">Novo episódio</button>
      </div>
    </header>

    <div class="filtros">
      <div class="chips" role="tablist" aria-label="Mês">
        <button class="chip" data-mes="todos">Todos</button>
        ${meses.map(([m, tema]) => `<button class="chip" data-mes="${m}" title="${esc(tema)}">Mês ${m}</button>`).join('')}
      </div>
      <select id="filtro-status" aria-label="Filtrar por status">
        <option value="todos">Todos os status</option>
        ${Object.entries(STATUS).map(([s, r]) => `<option value="${s}">${r}</option>`).join('')}
      </select>
    </div>

    <div id="semanas"></div>`;

  const desenhar = () => {
    $$('.chip', main).forEach(c => c.classList.toggle('ativo', c.dataset.mes === String(filtroMes)));
    $('#filtro-status', main).value = filtroStatus;
    const visiveis = eps.filter(e =>
      (filtroMes === 'todos' || e.mes === Number(filtroMes)) &&
      (filtroStatus === 'todos' || e.status === filtroStatus));
    const semanas = [...new Set(visiveis.map(e => e.semana))];
    $('#semanas', main).innerHTML = semanas.length ? semanas.map(n => {
      const doGrupo = visiveis.filter(e => e.semana === n);
      return `
        <section class="semana">
          <h2><span class="mono">Semana ${n}</span> ${esc(doGrupo[0].tema_mes)}</h2>
          <div class="episodios">${doGrupo.map(linhaEpisodio).join('')}</div>
        </section>`;
    }).join('') : '<p class="vazio">Nenhum episódio com esse filtro.</p>';
  };

  main.addEventListener('click', async (e) => {
    const chip = e.target.closest('[data-mes]');
    if (chip) { filtroMes = chip.dataset.mes; desenhar(); return; }
    const card = e.target.closest('[data-ep]');
    if (card && !e.target.closest('select')) {
      const ep = eps.find(x => x.id === card.dataset.ep);
      editarEpisodio(ep, salvo => { Object.assign(ep, salvo); desenhar(); });
    }
  });
  main.addEventListener('change', async (e) => {
    if (e.target.id === 'filtro-status') { filtroStatus = e.target.value; desenhar(); return; }
    const sel = e.target.closest('[data-status-de]');
    if (sel) {
      const ep = eps.find(x => x.id === sel.dataset.statusDe);
      const { error: err } = await supabase.from('episodios').update({ status: sel.value }).eq('id', ep.id);
      if (falhou(err, 'Erro ao salvar status')) { sel.value = ep.status; return; }
      ep.status = sel.value;
      desenhar();
      avisar('Status atualizado.');
    }
  });

  $('#btn-datas', main).addEventListener('click', () => distribuirDatas(eps, desenhar));
  $('#btn-novo', main).addEventListener('click', () => {
    const ultima = eps.at(-1);
    const novo = { mes: ultima?.mes ?? 1, tema_mes: ultima?.tema_mes ?? '', semana: (ultima?.semana ?? 0) + 1, dia: 'seg', titulo: '', subtitulo: '', status: 'ideia' };
    editarEpisodio(novo, salvo => { eps.push(salvo); desenhar(); });
  });

  desenhar();

  // Link direto para um episódio: #cronograma/<id>
  const idDireto = location.hash.split('/')[1];
  const direto = idDireto && eps.find(x => x.id === idDireto);
  if (direto) editarEpisodio(direto, salvo => { Object.assign(direto, salvo); desenhar(); });
}

function linhaEpisodio(e) {
  const d = DIAS[e.dia];
  const travessao = TEM_TRAVESSAO.test(e.hook + e.roteiro + e.cta);
  return `
    <article class="episodio" data-ep="${e.id}" tabindex="0">
      <div class="episodio-dia cor-${d.cor}">
        <span>${d.rotulo}</span>
        <small>${d.pilar}</small>
      </div>
      <div class="episodio-texto">
        <h3>${esc(e.titulo)}</h3>
        <p>${esc(e.subtitulo)}</p>
        <p class="episodio-meta">
          ${e.data_publicacao ? `<span class="mono">${formatarData(e.data_publicacao)}</span>` : '<span class="mono">Sem data</span>'}
          ${e.roteiro ? '<span class="mono">Roteiro escrito</span>' : ''}
          ${travessao ? '<span class="mono alerta-txt">Tem travessão</span>' : ''}
        </p>
      </div>
      <select class="status-sel status-${e.status}" data-status-de="${e.id}" aria-label="Status">
        ${Object.entries(STATUS).map(([s, r]) => `<option value="${s}"${s === e.status ? ' selected' : ''}>${r}</option>`).join('')}
      </select>
    </article>`;
}

function editarEpisodio(ep, aoSalvar) {
  const novo = !ep.id;
  abrirDialogo(`
    <form class="form-dialogo form-largo" method="dialog">
      <header>
        <p class="mono">${novo ? 'Novo episódio' : `Semana ${ep.semana} · ${DIAS[ep.dia].rotulo}`}</p>
        <button class="fechar" type="button" data-fechar aria-label="Fechar">×</button>
      </header>
      <div class="campos-linha">
        <label>Mês <input type="number" name="mes" min="1" value="${ep.mes}" required></label>
        <label>Semana <input type="number" name="semana" min="1" value="${ep.semana}" required></label>
        <label>Dia
          <select name="dia">${Object.entries(DIAS).map(([k, d]) => `<option value="${k}"${k === ep.dia ? ' selected' : ''}>${d.rotulo} · ${d.pilar}</option>`).join('')}</select>
        </label>
      </div>
      <label>Título <input name="titulo" value="${esc(ep.titulo)}" required></label>
      <label>Subtítulo <input name="subtitulo" value="${esc(ep.subtitulo)}"></label>
      <div class="campos-linha">
        <label>Status
          <select name="status">${Object.entries(STATUS).map(([s, r]) => `<option value="${s}"${s === ep.status ? ' selected' : ''}>${r}</option>`).join('')}</select>
        </label>
        <label>Data de publicação <input type="date" name="data_publicacao" value="${ep.data_publicacao ?? ''}"></label>
      </div>
      <label>Hook <span class="dica">primeiros 2 a 3 segundos</span>
        <textarea name="hook" rows="2">${esc(ep.hook)}</textarea>
      </label>
      <label>Roteiro <span class="dica" id="contagem"></span>
        <textarea name="roteiro" rows="14" placeholder="Oi, eu sou a Elisa, economista, e hoje eu vou te mostrar como [tema] afeta o seu dinheiro.">${esc(ep.roteiro)}</textarea>
      </label>
      <label>Encerramento / CTA <textarea name="cta" rows="2">${esc(ep.cta)}</textarea></label>
      <label>Notas <textarea name="notas" rows="3">${esc(ep.notas)}</textarea></label>
      <label>Link do post publicado <input type="url" name="link_post" value="${esc(ep.link_post)}" placeholder="https://www.instagram.com/reel/..."></label>
      <p class="alerta" id="aviso-travessao" hidden>
        O texto tem travessões. <button class="btn btn-leve btn-pequeno" type="button" id="btn-trocar">Trocar por vírgulas</button>
      </p>
      <footer>
        <button class="btn btn-leve" type="button" id="btn-copiar">Copiar roteiro</button>
        <span class="espaco"></span>
        <button class="btn btn-leve" type="button" data-fechar>Cancelar</button>
        <button class="btn btn-primario" type="submit">Salvar</button>
      </footer>
    </form>`, (d) => {
    const f = $('form', d);
    const textos = ['hook', 'roteiro', 'cta'];

    const atualizar = () => {
      const palavras = (f.roteiro.value.trim().match(/\S+/g) || []).length;
      // Fala gravada fica perto de 150 palavras por minuto
      const seg = Math.round(palavras / 150 * 60);
      $('#contagem', d).textContent = palavras ? `${palavras} palavras · cerca de ${seg}s (meta 75 a 90s)` : 'meta 75 a 90s';
      $('#aviso-travessao', d).hidden = !textos.some(n => TEM_TRAVESSAO.test(f[n].value));
    };
    f.addEventListener('input', atualizar);
    atualizar();

    $('#btn-trocar', d).addEventListener('click', () => {
      textos.forEach(n => { f[n].value = trocarTravessoes(f[n].value); });
      atualizar();
    });

    $('#btn-copiar', d).addEventListener('click', async () => {
      const texto = [f.hook.value, f.roteiro.value, f.cta.value].filter(Boolean).join('\n\n');
      await navigator.clipboard.writeText(texto);
      avisar('Roteiro copiado.');
    });

    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const dados = Object.fromEntries(new FormData(f));
      dados.mes = Number(dados.mes);
      dados.semana = Number(dados.semana);
      dados.data_publicacao = dados.data_publicacao || null;
      if (novo) dados.tema_mes = ep.tema_mes ?? '';
      const consulta = novo
        ? supabase.from('episodios').insert(dados).select().single()
        : supabase.from('episodios').update(dados).eq('id', ep.id).select().single();
      const { data, error } = await consulta;
      if (error?.code === '23505') { avisar('Já existe um episódio nessa semana e dia.', true); return; }
      if (falhou(error, 'Erro ao salvar')) return;
      aoSalvar(data);
      d.close();
      avisar('Episódio salvo.');
    });
  });
}

function distribuirDatas(eps, aoTerminar) {
  const semData = eps.filter(e => !e.data_publicacao).length;
  abrirDialogo(`
    <form class="form-dialogo" method="dialog">
      <header>
        <p class="mono">Distribuir datas</p>
        <button class="fechar" type="button" data-fechar aria-label="Fechar">×</button>
      </header>
      <p>Escolha a segunda-feira da semana 1. Cada episódio recebe a segunda, quarta ou sexta da sua semana.</p>
      <label>Início da semana 1 <input type="date" name="inicio" required></label>
      <label class="check"><input type="checkbox" name="sobrescrever"> Substituir também as datas já preenchidas</label>
      <p class="dica">${semData} episódio(s) estão sem data.</p>
      <footer>
        <span class="espaco"></span>
        <button class="btn btn-leve" type="button" data-fechar>Cancelar</button>
        <button class="btn btn-primario" type="submit">Aplicar</button>
      </footer>
    </form>`, (d) => {
    const f = $('form', d);
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const inicio = new Date(`${f.inicio.value}T12:00:00`);
      // Ajusta para a segunda-feira daquela semana
      inicio.setDate(inicio.getDate() - ((inicio.getDay() + 6) % 7));
      const alvo = eps.filter(ep => f.sobrescrever.checked || !ep.data_publicacao);
      const botao = $('button[type=submit]', f);
      botao.disabled = true;
      for (const ep of alvo) {
        const dt = new Date(inicio);
        dt.setDate(dt.getDate() + (ep.semana - 1) * 7 + DIAS[ep.dia].offset);
        const iso = dt.toLocaleDateString('sv-SE');
        const { error } = await supabase.from('episodios').update({ data_publicacao: iso }).eq('id', ep.id);
        if (falhou(error, 'Erro ao salvar data')) { botao.disabled = false; return; }
        ep.data_publicacao = iso;
      }
      d.close();
      aoTerminar();
      avisar(`${alvo.length} data(s) preenchida(s).`);
    });
  });
}

// ─────────────────────────────────────────────────────────────
// Documentos
// ─────────────────────────────────────────────────────────────

const PASTAS = ['Roteiros', 'Briefings', 'Curso', 'Identidade visual', 'Ebooks', 'Outros'];
const pastaChave = p => nomeSeguro(p);

async function telaDocumentos(main) {
  main.innerHTML = `
    <header class="cabecalho">
      <p class="mono">Documentos</p>
      <h1>Tudo em <em>um só lugar</em></h1>
    </header>

    <section class="painel-bloco">
      <h2>Enviar arquivos</h2>
      <form id="form-upload" class="form-inline">
        <select name="pasta" aria-label="Pasta">${PASTAS.map(p => `<option>${p}</option>`).join('')}</select>
        <input type="file" name="arquivos" multiple required>
        <button class="btn btn-primario" type="submit">Enviar</button>
      </form>
    </section>

    <div id="pastas" class="pastas"></div>

    <section class="painel-bloco">
      <h2>Links</h2>
      <p class="dica">Canvas da identidade, documentos do curso, pastas do Canva, o que precisar ter à mão.</p>
      <form id="form-link" class="form-inline">
        <input name="titulo" placeholder="Nome" required>
        <input name="url" type="url" placeholder="https://" required>
        <select name="categoria" aria-label="Categoria">${PASTAS.map(p => `<option>${p}</option>`).join('')}</select>
        <button class="btn btn-primario" type="submit">Adicionar</button>
      </form>
      <ul id="links" class="lista-arquivos"></ul>
    </section>`;

  const listarPastas = async () => {
    const blocos = await Promise.all(PASTAS.map(async (p) => {
      const { data, error } = await supabase.storage.from('documentos')
        .list(pastaChave(p), { limit: 1000, sortBy: { column: 'name', order: 'asc' } });
      if (error) return { p, erro: error.message, arquivos: [] };
      return { p, arquivos: data.filter(a => a.id && !a.name.startsWith('.')) };
    }));
    $('#pastas', main).innerHTML = blocos.map(({ p, arquivos, erro }) => `
      <section class="painel-bloco pasta">
        <h2>${esc(p)} <span class="mono">${arquivos.length}</span></h2>
        ${erro ? `<p class="alerta">${esc(erro)}</p>` : ''}
        ${arquivos.length ? `<ul class="lista-arquivos">${arquivos.map(a => `
          <li>
            <span class="arquivo-nome">${esc(a.name)}</span>
            <span class="mono">${a.metadata?.size ? tamanho(a.metadata.size) : ''}</span>
            <button class="btn btn-leve btn-pequeno" data-abrir="${esc(pastaChave(p))}/${esc(a.name)}">Abrir</button>
            <button class="btn btn-leve btn-pequeno" data-apagar="${esc(pastaChave(p))}/${esc(a.name)}">Apagar</button>
          </li>`).join('')}</ul>` : '<p class="vazio">Vazia.</p>'}
      </section>`).join('');
  };

  const listarLinks = async () => {
    const { data, error } = await supabase.from('links').select('*').order('categoria').order('titulo');
    if (falhou(error, 'Erro ao carregar links')) return;
    $('#links', main).innerHTML = data.length ? data.map(l => `
      <li>
        <a class="arquivo-nome" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.titulo)}</a>
        <span class="mono">${esc(l.categoria)}</span>
        <button class="btn btn-leve btn-pequeno" data-apagar-link="${l.id}">Apagar</button>
      </li>`).join('') : '<li class="vazio">Nenhum link ainda.</li>';
  };

  $('#form-upload', main).addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const botao = $('button', f);
    botao.disabled = true;
    let enviados = 0;
    for (const arq of f.arquivos.files) {
      const caminho = `${pastaChave(f.pasta.value)}/${nomeSeguro(arq.name)}`;
      const { error } = await supabase.storage.from('documentos').upload(caminho, arq, { upsert: false });
      if (error) avisar(`${arq.name}: ${/exists|Duplicate/i.test(error.message) ? 'já existe um arquivo com esse nome' : error.message}`, true);
      else enviados++;
    }
    botao.disabled = false;
    f.arquivos.value = '';
    if (enviados) avisar(`${enviados} arquivo(s) enviado(s).`);
    listarPastas();
  });

  $('#form-link', main).addEventListener('submit', async (e) => {
    e.preventDefault();
    const dados = Object.fromEntries(new FormData(e.target));
    const { error } = await supabase.from('links').insert(dados);
    if (falhou(error, 'Erro ao salvar link')) return;
    e.target.reset();
    listarLinks();
  });

  main.addEventListener('click', async (e) => {
    const abrir = e.target.closest('[data-abrir]');
    if (abrir) {
      const { data, error } = await supabase.storage.from('documentos').createSignedUrl(abrir.dataset.abrir, 120);
      if (!falhou(error, 'Erro ao abrir')) window.open(data.signedUrl, '_blank', 'noopener');
      return;
    }
    const apagar = e.target.closest('[data-apagar]');
    if (apagar && confirm(`Apagar "${apagar.dataset.apagar}"? Não dá para desfazer.`)) {
      const { error } = await supabase.storage.from('documentos').remove([apagar.dataset.apagar]);
      if (!falhou(error, 'Erro ao apagar')) { avisar('Arquivo apagado.'); listarPastas(); }
      return;
    }
    const apagarLink = e.target.closest('[data-apagar-link]');
    if (apagarLink && confirm('Apagar este link?')) {
      const { error } = await supabase.from('links').delete().eq('id', apagarLink.dataset.apagarLink);
      if (!falhou(error, 'Erro ao apagar link')) listarLinks();
    }
  });

  listarPastas();
  listarLinks();
}

function tamanho(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

// ─────────────────────────────────────────────────────────────
// Conteúdos gratuitos (o que aparece no site público)
// ─────────────────────────────────────────────────────────────

const TIPOS = { ebook: 'Ebook', guia: 'Guia', planilha: 'Planilha', aula: 'Aula', artigo: 'Artigo', link: 'Link' };
const CORES = { terracota: 'Terracota', salvia: 'Sálvia', areia: 'Areia', rose: 'Rosé', oliva: 'Oliva' };

async function telaConteudos(main) {
  const { data: itens, error } = await supabase.from('conteudos').select('*')
    .order('destaque', { ascending: false }).order('ordem').order('criado_em', { ascending: false });
  if (falhou(error, 'Erro ao carregar conteúdos')) return;

  main.innerHTML = `
    <header class="cabecalho cabecalho-acoes">
      <div>
        <p class="mono">Conteúdos gratuitos</p>
        <h1>O que aparece <em>no site</em></h1>
      </div>
      <div class="acoes">
        <a class="btn btn-leve" href="../#conteudos" target="_blank" rel="noopener">Ver no site</a>
        <button class="btn btn-primario" id="btn-novo-conteudo" type="button">Novo conteúdo</button>
      </div>
    </header>
    <p class="dica">Só os conteúdos marcados como publicados aparecem na página pública. Lembre que o site é só educacional: nada de oferta de serviço ou venda.</p>
    <div class="lista-conteudos">
      ${itens.length ? itens.map(c => `
        <article class="item-conteudo">
          <div class="item-capa cor-${esc(c.cor)}">${c.capa_url ? `<img src="${esc(urlDoSite(c.capa_url))}" alt="">` : ''}</div>
          <div class="item-texto">
            <p class="mono">${TIPOS[c.tipo] ?? c.tipo}${c.destaque ? ' · destaque' : ''}</p>
            <h3>${esc(c.titulo)}</h3>
            <p>${esc(c.descricao)}</p>
          </div>
          <div class="item-acoes">
            <label class="check"><input type="checkbox" data-publicar="${c.id}"${c.publicado ? ' checked' : ''}> Publicado</label>
            <button class="btn btn-leve btn-pequeno" data-editar="${c.id}">Editar</button>
          </div>
        </article>`).join('') : '<p class="vazio">Nenhum conteúdo ainda.</p>'}
    </div>`;

  $('#btn-novo-conteudo', main).addEventListener('click', () =>
    editarConteudo({ titulo: '', descricao: '', tipo: 'ebook', cor: 'areia', publicado: false, destaque: false, ordem: 0 }, () => rotear()));

  main.addEventListener('click', (e) => {
    const b = e.target.closest('[data-editar]');
    if (b) editarConteudo(itens.find(c => c.id === b.dataset.editar), () => rotear());
  });
  main.addEventListener('change', async (e) => {
    const cb = e.target.closest('[data-publicar]');
    if (!cb) return;
    const { error: err } = await supabase.from('conteudos').update({ publicado: cb.checked }).eq('id', cb.dataset.publicar);
    if (falhou(err, 'Erro ao salvar')) { cb.checked = !cb.checked; return; }
    avisar(cb.checked ? 'Publicado no site.' : 'Retirado do site.');
  });
}

async function enviarPublico(arquivo, pasta) {
  const caminho = `${pasta}/${Date.now()}-${nomeSeguro(arquivo.name)}`;
  const { error } = await supabase.storage.from('conteudos-publicos').upload(caminho, arquivo);
  if (falhou(error, 'Erro ao enviar arquivo')) return null;
  return supabase.storage.from('conteudos-publicos').getPublicUrl(caminho).data.publicUrl;
}

function editarConteudo(c, aoSalvar) {
  const novo = !c.id;
  abrirDialogo(`
    <form class="form-dialogo" method="dialog">
      <header>
        <p class="mono">${novo ? 'Novo conteúdo' : 'Editar conteúdo'}</p>
        <button class="fechar" type="button" data-fechar aria-label="Fechar">×</button>
      </header>
      <label>Título <input name="titulo" value="${esc(c.titulo)}" required></label>
      <label>Descrição <textarea name="descricao" rows="3">${esc(c.descricao)}</textarea></label>
      <div class="campos-linha">
        <label>Tipo <select name="tipo">${Object.entries(TIPOS).map(([k, r]) => `<option value="${k}"${k === c.tipo ? ' selected' : ''}>${r}</option>`).join('')}</select></label>
        <label>Cor do card <select name="cor">${Object.entries(CORES).map(([k, r]) => `<option value="${k}"${k === c.cor ? ' selected' : ''}>${r}</option>`).join('')}</select></label>
        <label>Ordem <input type="number" name="ordem" value="${c.ordem ?? 0}"></label>
      </div>
      <fieldset>
        <legend>Arquivo ou link</legend>
        <input type="file" name="arquivo" accept=".pdf,.xlsx,.xls,.csv,.zip,.png,.jpg">
        <input name="arquivo_url" value="${esc(c.arquivo_url ?? '')}" placeholder="ou cole um link (YouTube, Drive...)">
      </fieldset>
      <fieldset>
        <legend>Capa (opcional)</legend>
        <input type="file" name="capa" accept="image/*">
        <input name="capa_url" value="${esc(c.capa_url ?? '')}" placeholder="ou cole o link de uma imagem">
      </fieldset>
      <label class="check"><input type="checkbox" name="destaque"${c.destaque ? ' checked' : ''}> Destaque (aparece primeiro)</label>
      <label class="check"><input type="checkbox" name="publicado"${c.publicado ? ' checked' : ''}> Publicado no site</label>
      <p class="alerta" id="aviso-travessao-c" hidden>O título ou a descrição têm travessões.</p>
      <footer>
        ${novo ? '' : '<button class="btn btn-leve" type="button" id="btn-apagar-conteudo">Apagar</button>'}
        <span class="espaco"></span>
        <button class="btn btn-leve" type="button" data-fechar>Cancelar</button>
        <button class="btn btn-primario" type="submit">Salvar</button>
      </footer>
    </form>`, (d) => {
    const f = $('form', d);
    const checar = () => { $('#aviso-travessao-c', d).hidden = !TEM_TRAVESSAO.test(f.titulo.value + f.descricao.value); };
    f.addEventListener('input', checar);
    checar();

    $('#btn-apagar-conteudo', d)?.addEventListener('click', async () => {
      if (!confirm('Apagar este conteúdo do site? Não dá para desfazer.')) return;
      const { error } = await supabase.from('conteudos').delete().eq('id', c.id);
      if (falhou(error, 'Erro ao apagar')) return;
      d.close();
      avisar('Conteúdo apagado.');
      aoSalvar();
    });

    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const botao = $('button[type=submit]', f);
      botao.disabled = true;
      let arquivoUrl = f.arquivo_url.value.trim();
      let capaUrl = f.capa_url.value.trim();
      if (f.arquivo.files[0]) arquivoUrl = await enviarPublico(f.arquivo.files[0], 'arquivos') ?? arquivoUrl;
      if (f.capa.files[0]) capaUrl = await enviarPublico(f.capa.files[0], 'capas') ?? capaUrl;
      if (!arquivoUrl) { botao.disabled = false; avisar('Envie um arquivo ou cole um link.', true); return; }

      const dados = {
        titulo: f.titulo.value.trim(),
        descricao: f.descricao.value.trim(),
        tipo: f.tipo.value,
        cor: f.cor.value,
        ordem: Number(f.ordem.value) || 0,
        arquivo_url: arquivoUrl,
        capa_url: capaUrl || null,
        destaque: f.destaque.checked,
        publicado: f.publicado.checked,
      };
      const { error } = novo
        ? await supabase.from('conteudos').insert(dados)
        : await supabase.from('conteudos').update(dados).eq('id', c.id);
      botao.disabled = false;
      if (falhou(error, 'Erro ao salvar')) return;
      d.close();
      avisar('Conteúdo salvo.');
      aoSalvar();
    });
  });
}

// ─────────────────────────────────────────────────────────────
// Identidade visual
// ─────────────────────────────────────────────────────────────

const PALETA = [
  { nome: 'Creme', hex: '#FBF6EE', uso: 'Fundo' },
  { nome: 'Terracota', hex: '#D9826D', uso: 'Cor da marca · Reels de quarta' },
  { nome: 'Sálvia', hex: '#ACBC80', uso: 'Reels de segunda' },
  { nome: 'Areia', hex: '#E9C17E', uso: 'Reels de sexta' },
  { nome: 'Rosé', hex: '#E8A693', uso: 'Posts e destaques' },
  { nome: 'Oliva', hex: '#55603F', uso: 'Ícone' },
  { nome: 'Grafite quente', hex: '#2E2A24', uso: 'Texto' },
];

function telaIdentidade(main) {
  main.innerHTML = `
    <header class="cabecalho">
      <p class="mono">Identidade visual</p>
      <h1>A cara da <em>elisa.</em></h1>
    </header>

    <section class="painel-bloco">
      <h2>Paleta <span class="dica">clique para copiar</span></h2>
      <div class="paleta">
        ${PALETA.map(c => `
          <button class="cor" data-copiar="${c.hex}" type="button">
            <span class="cor-amostra" style="background:${c.hex}"></span>
            <strong>${c.nome}</strong>
            <span class="mono">${c.hex}</span>
            <small>${c.uso}</small>
          </button>`).join('')}
      </div>
      <p class="dica">Texto sempre escuro (grafite) sobre as cores. Cantos arredondados.</p>
    </section>

    <section class="painel-bloco">
      <h2>Tipografia</h2>
      <div class="tipos">
        <div><p class="mono">Títulos · Fraunces Light e Itálico</p><p class="amostra-serif">Os papers que <em>mudaram</em> o seu dinheiro</p></div>
        <div><p class="mono">Texto · DM Sans</p><p class="amostra-sans">Frases curtas, uma ideia por linha. Termos técnicos sempre traduzidos logo depois.</p></div>
        <div><p class="mono">Referências · DM Mono</p><p class="amostra-mono">Markowitz, H. (1952). Portfolio Selection. The Journal of Finance.</p></div>
      </div>
    </section>

    <section class="painel-bloco">
      <h2>Marca</h2>
      <div class="marcas">
        <div class="marca-caixa"><span class="marca marca-g">elisa<span class="ponto">.</span></span><small>Instagram, Reels, posts, marca d'água</small></div>
        <div class="marca-caixa"><span class="marca marca-g">Elisa Schulz<span class="ponto">.</span></span><small>Nome do perfil, LinkedIn, materiais longos</small></div>
        <div class="marca-caixa"><span class="icone icone-g">elisa<span class="ponto">.</span></span><small>Ícone oliva</small></div>
        <div class="marca-caixa"><span class="icone icone-g icone-rose">elisa<span class="ponto">.</span></span><small>Variação rosé</small></div>
        <div class="marca-caixa"><span class="icone icone-g icone-salvia">elisa<span class="ponto">.</span></span><small>Variação sálvia</small></div>
        <div class="marca-caixa"><span class="icone icone-g icone-contorno">elisa<span class="ponto">.</span></span><small>Variação contorno</small></div>
      </div>
    </section>

    <section class="painel-bloco">
      <h2>Reels</h2>
      <div class="reels">
        ${Object.values(DIAS).map(d => `
          <div class="reel cor-${d.cor}">
            <span class="mono">${d.rotulo}</span>
            <strong>${d.pilar}</strong>
            <span class="reel-marca">elisa<span class="ponto">.</span></span>
          </div>`).join('')}
      </div>
    </section>

    <section class="painel-bloco">
      <h2>Tom de voz</h2>
      <ul class="regras">
        <li>Formal, mas caloroso. Frases curtas, uma ideia por linha.</li>
        <li>Abertura fixa: "Oi, eu sou a Elisa, economista, e hoje eu vou te mostrar como [tema] afeta o seu dinheiro."</li>
        <li>Raciocínio em camadas: contexto, conceito, exemplo do cotidiano, implicação. Grupos de três.</li>
        <li>Nunca usar travessões.</li>
      </ul>
    </section>`;

  main.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-copiar]');
    if (!b) return;
    await navigator.clipboard.writeText(b.dataset.copiar);
    avisar(`${b.dataset.copiar} copiado.`);
  });
}

iniciar();
