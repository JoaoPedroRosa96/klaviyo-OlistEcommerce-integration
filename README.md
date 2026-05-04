# Klaviyo × Olist (Olist Ecommerce) — Integração

Integração entre a plataforma **Olist Ecommerce ** e o **Klaviyo** via Google Apps Script e Google Tag Manager, sem custo de infraestrutura.

---

## Visão geral

```
Loja Olist Ecommerce
  │
  ├── Webhook order.confirmed ──► Apps Script (doPost)
  │                                     │
  │                                     ▼
  │                              Google Sheets (fila)
  │                                     │
  │                                     ▼ (trigger a cada 1h)
  │                              Klaviyo API
  │                              ├── Placed Order
  │                              ├── Ordered Product (por item)
  │                              └── Perfil + Lista
  │
  ├── Footer newsletter ──► Zapier ──► Google Sheets (Forms Newsletter)
  │                                          │
  │                                          ▼ (trigger a cada 1h)
  │                                   Klaviyo API
  │                                   └── Perfil + Lista
  │
  └── GTM (client-side)
      ├── Active on Site     (klaviyo.js — automático)
      ├── Viewed Product     (view_item)
      ├── Added to Cart      (add_to_cart)
      ├── Started Checkout   (begin_checkout)
      └── Removed from Cart  (remove_from_cart)
```

---

## Pré-requisitos

- Conta Google (Gmail) para o Apps Script e Google Sheets
- Conta Klaviyo com acesso a API Keys
- Acesso ao GTM da loja
- Acesso ao painel admin da loja VNDA para configurar webhook

---

## Parte 1 — Google Apps Script

### 1.1 Criar a planilha

Faça uma cópia do modelo oficial:

👉 **[Clique aqui para copiar a planilha modelo](https://docs.google.com/spreadsheets/d/19N4uzNehpqv8jfO2HRGm5Qv9QaSsP9V3MC0nIZ6AvEQ/copy)**

A planilha contém duas abas:

**Sheet1** — fila de pedidos:
| A | B | C | D | E | F |
|---|---|---|---|---|---|
| Data | Raw Body Olist | Raw Body Klaviyo | Status Placed Order | Status Ordered Product | Status Perfil/Lista |

**Forms Newsletter** — fila de newsletter:
| A | B | C |
|---|---|---|
| Data | Email | Status |

---

### 1.2 Criar o projeto Apps Script

1. Abra a planilha copiada
2. Clique em **Extensões → Apps Script**
3. Apague o conteúdo padrão e cole o conteúdo do arquivo [`apps-script/Code.gs`](./apps-script/Code.gs)
4. Salve o projeto (`Ctrl+S`)

---

### 1.3 Preencher as configurações

No topo do script, localize o objeto `CONFIG` e preencha:

```javascript
const CONFIG = {
  klaviyo: {
    apiKey:  "SEU_KLAVIYO_API_KEY",   // Klaviyo → Settings → API Keys → Private Key
    listId:  "SEU_LIST_ID",           // Klaviyo → Audience → Lists → URL da lista
    // ...
  },
  loja: {
    url:  "https://www.suaLoja.com.br",  // URL pública da loja (sem barra no final)
    nome: "Nome da Loja"
  },
  planilha: {
    id:  "SEU_SPREADSHEET_ID",  // ID da planilha (entre /d/ e /edit na URL)
    aba: "Sheet1"
  }
};
```

**Como encontrar cada valor:**

| Campo | Onde encontrar |
|---|---|
| `apiKey` | Klaviyo → Settings → API Keys → Create Private API Key |
| `listId` | Klaviyo → Audience → Lists & Segments → clique na lista → ID na URL |
| `planilha.id` | URL da planilha: `docs.google.com/spreadsheets/d/**ID**/edit` |

---

### 1.4 Publicar como Web App

1. No Apps Script, clique em **Implantar → Nova implantação**
2. Tipo: **App da Web**
3. Executar como: **Eu mesmo**
4. Quem tem acesso: **Qualquer pessoa**
5. Clique em **Implantar** e copie a URL gerada

> ⚠️ Guarde essa URL — ela será usada como endpoint do webhook na plataforma VNDA.

---

### 1.5 Configurar o webhook na plataforma VNDA

1. Acesse o painel admin da loja
2. Vá em **Configurações → Integrações → Webhooks**
3. Crie um novo webhook:
   - **Evento:** `order.confirmed`
   - **URL:** cole a URL gerada no passo anterior
   - **Método:** POST

---

### 1.6 Criar os triggers automáticos

Na planilha, acesse o menu **🔄 Klaviyo** e clique em:

- **⏰ Criar Trigger Pedidos (1h)** — processa a fila de pedidos a cada hora
- **⏰ Criar Trigger Newsletter** — processa a fila de newsletter a cada hora

---

### 1.7 Testar a integração

No menu **🔄 Klaviyo**:

1. Clique em **🧪 Testar Webhook** — insere um pedido fictício na planilha
2. Clique em **🧪 Processar Fila Agora** — processa imediatamente
3. Verifique as colunas D, E e F na planilha
4. No Klaviyo, acesse **Analytics → Metrics** e confirme os eventos

---

## Parte 2 — Google Tag Manager (client-side)

### 2.1 Instalar o snippet do Klaviyo

Crie uma tag **HTML personalizado** no GTM com o snippet abaixo. Substitua `PUBLIC_API_KEY` pela chave pública de 6 caracteres (Klaviyo → Settings → API Keys).

**Acionador:** All Pages

```html
<script async type="text/javascript"
  src="https://static.klaviyo.com/onsite/js/PUBLIC_API_KEY/klaviyo.js">
</script>
<script type="text/javascript">
  !function(){if(!window.klaviyo){window._klOnsite=window._klOnsite||[];
  try{window.klaviyo=new Proxy({},{get:function(n,i){return"push"===i?
  function(){var n;(n=window._klOnsite).push.apply(n,arguments)}:
  function(){for(var n=arguments.length,o=new Array(n),w=0;w<n;w++)
  o[w]=arguments[w];var t="function"==typeof o[o.length-1]?o.pop():void 0,
  e=new Promise((function(n){window._klOnsite.push([i].concat(o,
  [function(i){t&&t(i),n(i)}]))}));return e}}})}catch(n){
  window.klaviyo=window.klaviyo||[],window.klaviyo.push=function(){
  var n;(n=window._klOnsite).push.apply(n,arguments)}}}}();
</script>
```

> Após instalar esse snippet, o evento **Active on Site** passa a ser registrado automaticamente para usuários cookiados.

---

### 2.2 Criar as variáveis do dataLayer

Crie as seguintes variáveis no GTM do tipo **Variável da camada de dados (Versão 2)**:

| Nome da variável | Nome no dataLayer |
|---|---|
| DL - Items | `ecommerce.items` |
| DL - Value | `ecommerce.value` |
| DL - Transaction ID | `ecommerce.transaction_id` |
| DL - Coupon | `ecommerce.coupon` |
| DL - Currency | `ecommerce.currency` |
| DL - User Email | `user_data.email_address` |
| DL - User Phone | `user_data.phone_number` |

---

### 2.3 Criar as tags de eventos

Para cada evento abaixo, crie uma tag do tipo **HTML personalizado** no GTM usando o código disponível em [`gtm/klaviyo-tags.js`](./gtm/klaviyo-tags.js).

| Tag | Acionador | Evento Klaviyo |
|---|---|---|
| Klaviyo - Viewed Product | `view_item` | Viewed Product |
| Klaviyo - Added to Cart | `add_to_cart` | Added to Cart |
| Klaviyo - Started Checkout | `begin_checkout` | Started Checkout |
| Klaviyo - Removed from Cart | `remove_from_cart` | Removed from Cart |

> Os acionadores acima são do tipo **Evento personalizado** e correspondem aos eventos GA4 já emitidos pela plataforma VNDA no dataLayer.

---

### 2.4 Publicar o GTM

Após criar todas as tags e variáveis, clique em **Enviar** no GTM para publicar as alterações.

---

## Parte 3 — Newsletter (via Zapier)

### 3.1 Configurar o Zapier

1. Crie um Zap com o trigger no formulário de newsletter da loja
2. Como ação, configure o **Google Sheets** para inserir uma nova linha na aba **Forms Newsletter**:
   - **Coluna A:** data/hora atual
   - **Coluna B:** e-mail capturado (pode vir com prefixo `email:` — o script limpa automaticamente)
   - **Coluna C:** deixar vazio (será preenchido pelo script)

O trigger automático de newsletter processará os registros a cada hora.

---

## Eventos implementados

### Server-side (Apps Script)
| Evento | Descrição |
|---|---|
| Placed Order | Disparado quando um pedido é confirmado |
| Ordered Product | Um evento por item do pedido confirmado |
| Perfil/Lista | Cria ou atualiza o perfil do cliente e adiciona à lista configurada |

### Client-side (GTM)
| Evento | Descrição |
|---|---|
| Active on Site | Automático via `klaviyo.js` |
| Viewed Product | Visualização de página de produto |
| Added to Cart | Adição de item ao carrinho |
| Started Checkout | Início do processo de checkout |
| Removed from Cart | Remoção de item do carrinho |

---

## Estrutura do repositório

```
klaviyo-vnda-integration/
├── README.md
├── apps-script/
│   └── Code.gs          ← script completo para o Google Apps Script
└── gtm/
    └── klaviyo-tags.js  ← código das tags GTM com instruções de acionador
```

---

## Limitações conhecidas

- O Google Apps Script tem limite de **6 minutos por execução** — lojas com alto volume de pedidos podem precisar de ajustes no intervalo do trigger
- O Apps Script é recomendado para até ~5 lojas simultâneas. Para escala maior, considere uma arquitetura com Node.js + banco de dados
- O evento `Page View` é coberto pelo `Active on Site` do `klaviyo.js`

---

## Referências

- [Klaviyo Developers — Integrating without a pre-built integration](https://developers.klaviyo.com/en/docs/guide_to_integrating_a_platform_without_a_pre_built_klaviyo_integration)
- [Klaviyo API Reference — Events](https://developers.klaviyo.com/en/reference/create_event)
- [Klaviyo API Reference — Profiles](https://developers.klaviyo.com/en/reference/create_profile)
- [Google Apps Script — UrlFetchApp](https://developers.google.com/apps-script/reference/url-fetch/url-fetch-app)
