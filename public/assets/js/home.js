import { CONFIG, CONTEUDOS_PADRAO } from './config.js';
import { supabase } from './supabase.js';

const TIPOS = {
  ebook: { rotulo: 'Ebook', acao: 'Baixar o ebook' },
  guia: { rotulo: 'Guia', acao: 'Abrir o guia' },
  planilha: { rotulo: 'Planilha', acao: 'Baixar a planilha' },
  aula: { rotulo: 'Aula', acao: 'Assistir' },
  artigo: { rotulo: 'Artigo', acao: 'Ler' },
  link: { rotulo: 'Link', acao: 'Abrir' },
};

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function carregarConteudos() {
  if (!supabase) return CONTEUDOS_PADRAO;
  const { data, error } = await supabase
    .from('conteudos')
    .select('titulo, descricao, tipo, arquivo_url, capa_url, cor, destaque')
    .eq('publicado', true)
    .order('destaque', { ascending: false })
    .order('ordem', { ascending: true })
    .order('criado_em', { ascending: false });
  if (error || !data || data.length === 0) return CONTEUDOS_PADRAO;
  return data;
}

function card(c) {
  const tipo = TIPOS[c.tipo] || TIPOS.link;
  const externo = /^https?:\/\//.test(c.arquivo_url) && !c.arquivo_url.endsWith('.pdf');
  const capa = c.capa_url
    ? `<img src="${esc(c.capa_url)}" alt="" loading="lazy">`
    : `<span class="card-capa-titulo">${esc(c.titulo)}</span>`;
  return `
    <article class="card">
      <div class="card-capa cor-${esc(c.cor || 'areia')}">${capa}</div>
      <div class="card-corpo">
        <p class="mono">${tipo.rotulo} gratuito</p>
        <h3>${esc(c.titulo)}</h3>
        <p>${esc(c.descricao)}</p>
        <a class="btn btn-primario" href="${esc(c.arquivo_url)}" target="_blank" rel="noopener"${externo ? '' : ' download'}>${tipo.acao}</a>
      </div>
    </article>`;
}

async function renderizarConteudos() {
  const lista = document.getElementById('lista-conteudos');
  const conteudos = await carregarConteudos();
  lista.innerHTML = conteudos.length
    ? conteudos.map(card).join('')
    : '<p class="card-vazio">Os primeiros materiais chegam em breve.</p>';
}

function configurarInstagram() {
  const handle = CONFIG.INSTAGRAM_HANDLE.replace(/^@/, '').trim();
  if (!handle) return;
  const url = `https://www.instagram.com/${encodeURIComponent(handle)}/`;
  document.querySelectorAll('[data-instagram]').forEach(a => {
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.hidden = false;
  });
  document.querySelectorAll('[data-instagram-bloco]').forEach(el => { el.hidden = false; });
  document.querySelectorAll('[data-instagram-handle]').forEach(el => { el.textContent = `@${handle}`; });
}

configurarInstagram();
renderizarConteudos();
