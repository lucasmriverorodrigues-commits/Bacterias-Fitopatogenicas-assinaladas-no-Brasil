# GitHub Desktop e Cloudflare

O projeto está em `C:\Users\lucas\Desktop\BFABr`. A pasta `dist` é gerada pelo build e contém o site que será publicado. Os ZIPs e pacotes antigos não entram no repositório.

## GitHub Desktop

1. Em **File > Add local repository**, escolha `C:\Users\lucas\Desktop\BFABr`.
2. O repositório remoto é `lucasmriverorodrigues-commits/Bacterias-Fitopatogenicas-assinaladas-no-Brasil`.
3. Para testar a versão nova separadamente, use a branch `interface-v5-cloudflare`.
4. Faça **Commit** das alterações e **Publish branch / Push origin**. Se a versão já estiver commitada, basta **Push origin**.

O histórico do repositório anterior foi preservado. A branch `main` e o site do GitHub Pages não precisam ser substituídos para testar no Cloudflare.

## Cloudflare Workers (mesmo fluxo do HomeClimb)

Em **Workers & Pages > Create application > Import a repository**, selecione o repositório acima. Selecione a branch `interface-v5-cloudflare` nas configurações da integração Git.

| Configuração | Valor |
| --- | --- |
| Nome do Worker | `bacterias-fitopatogenicas-assinaladas-no-brasil` |
| Branch de produção | `interface-v5-cloudflare` |
| Diretório raiz | vazio, raiz do repositório |
| Comando de build | `npm run build` |
| Comando de deploy | `npx wrangler deploy --assets ./dist` |
| Versão do Node | `22` ou superior |

O arquivo `wrangler.jsonc` já aponta para `dist`. Use o mesmo nome de Worker indicado nele. O endereço real `workers.dev` será informado pelo painel após o primeiro deploy. Nenhum endereço de produção novo foi reservado por este documento.

Se a publicação indicar `Asset too large` e citar `.git/objects`, o diretório de arquivos estáticos está incorreto. Em **Settings > Build**, confira a branch de produção e os comandos acima. O diretório raiz do projeto deve continuar na raiz do repositório; somente os arquivos estáticos publicados vêm de `./dist`. Não use `--assets .` e não apague a pasta `.git`. Inicie um build da branch `interface-v5-cloudflare`, em vez de repetir um build de um commit antigo da `main`.

Após conectar o repositório, cada **Push origin** na branch configurada dispara uma nova publicação. Confira o sucesso do build antes de abrir o aplicativo.

## Teste local

```powershell
npm ci
npm run build
npm test
npm run dev
```

Abra `http://localhost:4175`. O build verifica a presença de todos os arquivos e fotos e gera uma versão de cache baseada no conteúdo. Não é necessário compactar ou subir as fotos uma a uma.

## Teste no celular

1. Abra o endereço público do Cloudflare e busque café, batata e tomate.
2. Confira os botões de fotos, a galeria, as fichas e o mapa por UF.
3. Em **Meu campo**, baixe as fotos e aguarde o contador chegar a **275/275**.
4. Adicione o aplicativo à tela inicial e reabra sem conexão. Confirme busca, fotos e mapa.

O armazenamento offline depende do dispositivo e pode ser removido pelo navegador. O indicador de disponibilidade mostra o que está efetivamente salvo. Ao mudar do Netlify/GitHub Pages para o Cloudflare, refaça o download no novo endereço; favoritos pertencem ao navegador e ao endereço usados.

## Uso em artigo científico

O endereço público pode ser compartilhado e incluído no artigo. Para permitir a reprodução da versão analisada:

- Cite o endereço público de produção, a versão e a data de acesso.
- Crie uma release no GitHub com o código e o acervo correspondentes à versão avaliada.
- Arquive essa release em um repositório de preservação, por exemplo Zenodo, para obter um DOI.
- Defina autores, licença do código e condições de uso das fotografias com a equipe antes do depósito. As marcas d'água originais foram preservadas.
- Descreva a origem da base, os critérios de atualização e as limitações. Resultados por sintomas são referências para consulta, não diagnóstico automatizado.

Um domínio próprio ou institucional pode facilitar a manutenção do endereço ao trocar de hospedagem. O DOI identifica a versão preservada; o site pode continuar recebendo atualizações. As exigências editoriais dependem da revista.

Fontes oficiais:

- [Cloudflare: integração Git](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/)
- [Cloudflare: arquivos estáticos](https://developers.cloudflare.com/workers/static-assets/)
- [GitHub: arquivar e citar software com DOI](https://docs.github.com/en/repositories/archiving-a-github-repository/referencing-and-citing-content)
