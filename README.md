# Fitobactérias BR · 5.0.0

Consulta de bactérias fitopatogênicas assinaladas no Brasil. Aplicativo estático instalável, com busca por cultura, nome científico e sinônimos, acervo fotográfico, favoritos, comparação e mapas por unidade federativa.

Base local: 388 hospedeiros e 776 associações após as consolidações já adotadas pelo aplicativo. O acervo contém 275 fotografias. Esta versão moderniza a interface e audita os vínculos das imagens; não adiciona novos registros científicos à base do compêndio 2008–2026.

## Desenvolvimento

```sh
npm ci
npm run build
npm test
npm run dev
```

O site compilado fica em `dist/`. O servidor local usa `http://localhost:4175`. `npm test` verifica integridade, exclusividade dos vínculos fotográficos, buscas, 27 estados e arquivos de publicação. Testes de navegador adicionais ficam em `scripts/browser-check.js` e usam Playwright e Chrome.

## Publicação

Leia [PUBLICACAO.md](PUBLICACAO.md) para GitHub Desktop, Cloudflare Workers, testes no celular e uso em artigo científico. A branch de preparação é `interface-v5-cloudflare`.

## Organização

- `assets/data.js`: registros e dicionários existentes, extraídos sem alteração do HTML anterior.
- `assets/app.js`: consolidação dos dados, fichas e comparação originais.
- `assets/experience.js`: navegação, busca, acessibilidade, favoritos e mapas locais da nova interface.
- `assets/catalog.js`: regras explícitas e auditáveis de associação de fotografias.
- `assets/photoDatabase.js` e `assets/fotos/`: catálogo e arquivos originais, com suas marcas d'água.
- `assets/brasil-estados.geojson`: limites simplificados por UF, obtidos da API de malhas do IBGE.
- `sw.js`: cache consistente da base e download opcional do acervo completo.
- `scripts/build.js`: cópia controlada dos arquivos, bibliotecas locais e identificação do cache por conteúdo.

## Interpretação

Fotos identificadas apenas no gênero ou com classificação incerta ficam no acervo complementar. Não são automaticamente atribuídas a uma espécie. O relatório `reports/catalog-audit-v5.json`, gerado pelos testes, registra correções e pendências. A conferência do nome do arquivo não substitui a validação científica da imagem original.

Os mapas representam registros publicados por UF. A intensidade indica quantidade de registros da base, não prevalência. Não representam locais exatos de detecção. O mapa comparativo conserva marcadores ilustrativos na região da capital, com esse aviso explícito.

Base e mapa ficam disponíveis offline após sua instalação. As fotos podem ser baixadas em **Meu campo**; o contador informa quantas foram salvas. Não há chamada a modelo de IA nem envio de consultas ou amostras a serviços externos. O contato com o laboratório abre o site da Coleção IBSBF.

## Fontes e dependências

- Compêndio local 2008–2026 e tabelas extraídas anteriormente do documento fornecido pelo responsável pelo aplicativo.
- [Malha simplificada do IBGE](https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR?formato=application/vnd.geo%2Bjson&intrarregiao=UF&qualidade=minima), obtida em 2026-10-01.
- Leaflet 1.9.4 e Lucide 0.468.0. Licenças incluídas em `assets/vendor/` e na distribuição.
- [W3C: acessibilidade cognitiva](https://www.w3.org/WAI/WCAG2/supplemental/): hierarquia clara, controles previsíveis, redução de escolhas repetidas, linguagem direta e foco acessível. Não foi realizado ensaio de usabilidade que comprove ganhos de desempenho.

Autoria, licença do aplicativo e autorização de reutilização das fotografias devem ser definidas pelos responsáveis antes de uma release científica; as licenças das bibliotecas não se estendem automaticamente às imagens.
