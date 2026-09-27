# Como criar um plugin do TermChat

Um plugin é um objeto no array PLUGINS dentro do index.html (e uma entrada
no plugins.json para o catálogo/API):

```js
{id:'meuplug', name:'meu-plugin', desc:'o que faz', cat:'ferramenta',
 perms:[],            // ['geolocation'|'notifications'|'clipboard'] — vazio = sem permissão
 run:async a=>{ ... return 'texto da resposta' }}
```

Regras obrigatórias:
1. Sem eval e sem innerHTML com dado do usuário — retorne texto puro (o app escapa)
2. Prefira APIs livres sem chave; se precisar de chave, leia do localStorage/config
   e nunca escreva a chave no código
3. Peça permissão de dispositivo com ensurePerm('...') só dentro do run
4. API externa: use fetch com try/catch e mensagens de erro claras
5. Adicione a mesma entrada no plugins.json (id, name, cat, perms, api)

Depois de adicionar, rode os testes: `pytest` valida estrutura e segurança.
