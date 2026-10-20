# elisa.

Site de Elisa Schulz, economista.

- **Página pública** (`public/index.html`): conteúdos gratuitos para quem acompanha o Instagram. Só educacional, sem oferta de serviços ou vendas.
- **Estúdio** (`public/area/`): área privada com cronograma de postagens, documentos, links, conteúdos do site e identidade visual. Usa Supabase para login, banco e arquivos.

O site é estático (HTML, CSS e JavaScript, sem etapa de build). Qualquer alteração em `main` é publicada automaticamente pelo GitHub Pages.

## Estrutura

```
public/
  index.html                 página pública
  conteudos/                 PDFs gratuitos que ficam no próprio site
  assets/css/base.css        paleta, fontes e componentes da identidade
  assets/js/config.js        configuração (Supabase e Instagram)
  area/                      estúdio (área logada)
supabase/
  schema.sql                 tabelas, regras de acesso e buckets
  seed.sql                   72 episódios do calendário e o ebook dos papers
```

## Configuração (uma vez só)

### 1. Supabase

1. Crie um projeto em [supabase.com](https://supabase.com) (o plano gratuito basta).
2. **SQL Editor > New query**: cole o conteúdo de `supabase/schema.sql` e clique em **Run**. Depois faça o mesmo com `supabase/seed.sql`.
3. **Authentication > Sign In / Providers**: desligue **Allow new users to sign up**. Assim ninguém consegue criar conta.
4. **Authentication > Users > Add user > Create new user**: crie o seu usuário com e-mail e senha (marque **Auto Confirm User**).
5. De volta ao **SQL Editor**, libere o seu acesso ao estúdio (troque pelo seu e-mail):
   ```sql
   insert into public.admins (user_id)
   select id from auth.users where email = 'SEU_EMAIL_AQUI';
   ```
6. **Project Settings > API**: copie a **Project URL** e a chave **anon public**.

### 2. Configurar o site

Edite `public/assets/js/config.js` e preencha `SUPABASE_URL`, `SUPABASE_ANON_KEY` e, quando o perfil estiver pronto, `INSTAGRAM_HANDLE`.

A chave `anon` foi feita para ficar visível no navegador: quem protege os dados são as regras do `schema.sql`, que só deixam a usuária listada em `admins` ler ou alterar o cronograma, os documentos e os links. Nunca coloque a chave `service_role` no site.

### 3. Publicar no GitHub Pages

1. No GitHub: **Settings > Pages > Build and deployment > Source: GitHub Actions**.
2. Faça merge na `main`. O site fica em `https://elisaschulz.github.io/elisa/` e o estúdio em `https://elisaschulz.github.io/elisa/area/`.
3. Para usar um domínio próprio, configure em **Settings > Pages > Custom domain**.

## Como usar o estúdio

- **Cronograma**: os 72 episódios das 24 semanas já vêm carregados. Clique em um episódio para escrever hook, roteiro e encerramento. O editor conta as palavras, estima a duração (meta de 75 a 90 segundos) e avisa quando há travessões, com um botão para trocá-los por vírgulas. **Distribuir datas** preenche as datas de segunda, quarta e sexta a partir da semana 1.
- **Documentos**: envie arquivos para pastas (Roteiros, Briefings, Curso, Identidade visual, Ebooks, Outros). Ficam privados: só abrem com login. Também dá para guardar links (canvas da identidade, documentos do curso, Canva).
- **Conteúdos gratuitos**: o que aparece na página pública. Envie um PDF ou cole um link, escolha a cor do card e marque **Publicado**.
- **Identidade visual**: paleta (clique para copiar o código da cor), tipografia, marca e tom de voz.

## Testar no computador

```
cd public
python3 -m http.server 8000
```

Abra `http://localhost:8000`. Sem o Supabase configurado, a página pública mostra o ebook dos papers, que já está no repositório.
