/**
 * =============================================
 * INTEGRAÇÃO VNDA (Olist Ecommerce) → KLAVIYO
 * =============================================
 *
 * Repositório: https://github.com/seu-usuario/klaviyo-vnda-integration
 *
 * FLUXO:
 * 1. Webhook order.confirmed → doPost → Insere na aba Sheet1
 * 2. Trigger a cada 1h → processarFilaKlaviyo → Envia eventos ao Klaviyo
 * 3. Zapier (ou similar) insere e-mails na aba Forms Newsletter
 * 4. Trigger a cada 1h → processarFilaNewsletter → Adiciona perfis à lista
 *
 * ESTRUTURA DA PLANILHA (Sheet1):
 * A: Data
 * B: Raw Body Olist
 * C: Raw Body Klaviyo (Placed Order — gerado pelo script)
 * D: Status Placed Order
 * E: Status Ordered Product
 * F: Status Perfil/Lista
 *
 * ESTRUTURA DA PLANILHA (Forms Newsletter):
 * A: Data
 * B: Email (aceita prefixo "email: " — o script limpa automaticamente)
 * C: Status
 *
 * =============================================
 * CONFIGURAÇÃO — preencha antes de usar
 * =============================================
 */
const CONFIG = {
  klaviyo: {
    // Chave privada da sua conta Klaviyo
    // Klaviyo → Settings → API Keys → Create Private API Key (Full Access)
    apiKey: "SEU_KLAVIYO_API_KEY",

    apiUrl: "https://a.klaviyo.com/api/events/",
    profilesUrl: "https://a.klaviyo.com/api/profiles/",

    // ID da lista onde os clientes serão adicionados
    // Klaviyo → Audience → Lists → clique na lista → copie o ID da URL
    listId: "SEU_LIST_ID",

    revision: "2024-02-15"
  },

  loja: {
    // URL pública da loja (sem barra no final)
    url: "https://www.suaLoja.com.br",
    nome: "Nome da Loja"
  },

  planilha: {
    // ID da planilha Google Sheets
    // Abra a planilha → copie o ID da URL entre /d/ e /edit
    id: "SEU_SPREADSHEET_ID",
    aba: "Sheet1"
  }
};

// =============================================
// FUNÇÃO 1: RECEBER WEBHOOK (doPost)
// =============================================
function doPost(e) {
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(10000);

    Logger.log("📥 Webhook recebido!");

    if (!e || !e.postData || !e.postData.contents) {
      throw new Error("Payload vazio ou inválido");
    }

    const rawBody = e.postData.contents;
    const payload = JSON.parse(rawBody);

    Logger.log("✅ JSON parseado com sucesso");

    if (payload.status !== "confirmed") {
      Logger.log("⏭️ Ignorado: status não é 'confirmed'");
      return ContentService.createTextOutput(JSON.stringify({
        status: "ignored",
        reason: "Not a confirmed order"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    Logger.log(`📦 Pedido confirmado: ${payload.code}`);

    inserirNaPlanilha(payload, rawBody);

    Logger.log(`✅ Pedido ${payload.code} inserido na fila`);

    return ContentService.createTextOutput(JSON.stringify({
      status: "queued",
      order: payload.code,
      message: "Pedido adicionado à fila para processamento"
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    Logger.log("❌ ERRO: " + error.toString());

    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);

  } finally {
    lock.releaseLock();
  }
}

// =============================================
// FUNÇÃO: INSERIR NA PLANILHA
// =============================================
function inserirNaPlanilha(payload, rawBody) {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.planilha.id);
    const sheet = ss.getSheetByName(CONFIG.planilha.aba);

    if (!sheet) {
      throw new Error(`Aba "${CONFIG.planilha.aba}" não encontrada`);
    }

    const agora = new Date();
    const dataFormatada = Utilities.formatDate(
      agora,
      ss.getSpreadsheetTimeZone(),
      "yyyy-MM-dd HH:mm:ss"
    );

    const row = [
      dataFormatada, // A: Data
      rawBody,       // B: Raw Body Olist
      '',            // C: Raw Body Klaviyo
      '',            // D: Status Placed Order
      '',            // E: Status Ordered Product
      ''             // F: Status Perfil/Lista
    ];

    sheet.appendRow(row);

    Logger.log(`📝 Linha inserida: ${payload.code} em ${dataFormatada}`);

  } catch (error) {
    Logger.log("❌ Erro ao inserir na planilha: " + error.toString());
    throw error;
  }
}

// =============================================
// FUNÇÃO 2: PROCESSAR FILA DE PEDIDOS (Trigger 1h)
// =============================================
function processarFilaKlaviyo() {
  const lock = LockService.getScriptLock();

  try {
    if (!lock.tryLock(5000)) {
      Logger.log("⏭️ Outra instância já está processando. Pulando execução.");
      return;
    }

    Logger.log("🔄 Iniciando processamento da fila...");

    const ss = SpreadsheetApp.openById(CONFIG.planilha.id);
    const sheet = ss.getSheetByName(CONFIG.planilha.aba);

    if (!sheet) throw new Error(`Aba "${CONFIG.planilha.aba}" não encontrada`);

    const lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      Logger.log("📭 Fila vazia");
      return;
    }

    const range = sheet.getRange(2, 1, lastRow - 1, 6);
    const values = range.getValues();

    const agora = new Date();
    const tresDiasAtras = new Date(agora.getTime() - (3 * 24 * 60 * 60 * 1000));

    let processados = 0;
    let erros = 0;
    const linhasParaProcessar = [];

    values.forEach((row, index) => {
      const rowNumber    = index + 2;
      const data         = row[0];
      const rawBodyOlist = row[1];
      const statusPlaced  = row[3];
      const statusOrdered = row[4];
      const statusPerfil  = row[5];

      if (!rawBodyOlist || rawBodyOlist === '') return;

      const placedPendente  = !statusPlaced  || !statusPlaced.toString().includes('✅');
      const orderedPendente = !statusOrdered || !statusOrdered.toString().includes('✅');
      const perfilPendente  = !statusPerfil  || !statusPerfil.toString().includes('✅');

      const deveProcessar = placedPendente || orderedPendente || perfilPendente;
      const dataAntiga = data && typeof data.getTime === 'function' && data < tresDiasAtras;
      const temErro = [statusPlaced, statusOrdered, statusPerfil].some(s => s && s.toString().includes('❌'));

      if (deveProcessar || (dataAntiga && temErro)) {
        linhasParaProcessar.push({
          rowNumber, rawBodyOlist,
          placedPendente, orderedPendente, perfilPendente
        });
      }
    });

    Logger.log(`📊 Total de linhas a processar: ${linhasParaProcessar.length}`);

    if (linhasParaProcessar.length === 0) {
      Logger.log("✅ Nenhuma linha pendente");
      return;
    }

    for (let i = 0; i < linhasParaProcessar.length; i++) {
      const linha = linhasParaProcessar[i];

      try {
        Logger.log(`🔄 Processando linha ${linha.rowNumber} (${i + 1}/${linhasParaProcessar.length})...`);

        const pedido = JSON.parse(linha.rawBodyOlist);
        if (!pedido.email) throw new Error("Email ausente no pedido");

        const dataHora = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), "yyyy-MM-dd HH:mm:ss");

        // 1. PLACED ORDER
        if (linha.placedPendente) {
          try {
            const eventoKlaviyo = montarEventoKlaviyo(pedido);
            sheet.getRange(linha.rowNumber, 3).setValue(JSON.stringify(eventoKlaviyo, null, 2));
            SpreadsheetApp.flush();

            const statusCode = enviarParaKlaviyo(eventoKlaviyo);
            sheet.getRange(linha.rowNumber, 4).setValue(`✅ Enviado (HTTP ${statusCode}) - ${dataHora}`);
            Logger.log(`✅ Placed Order enviado: ${pedido.code}`);
          } catch (err) {
            sheet.getRange(linha.rowNumber, 4).setValue(`❌ ${err.toString().substring(0, 180)} - ${dataHora}`);
            Logger.log(`❌ Placed Order erro: ${err.toString()}`);
          }
          Utilities.sleep(500);
        }

        // 2. ORDERED PRODUCT (um evento por item)
        if (linha.orderedPendente) {
          try {
            const orderItems = pedido.items || [];

            let orderTime = pedido.confirmed_at || pedido.received_at || new Date().toISOString();
            try {
              const dt = new Date(orderTime);
              orderTime = isNaN(dt.getTime()) ? new Date().toISOString() : dt.toISOString();
            } catch (e) { orderTime = new Date().toISOString(); }

            let phoneNumber = '';
            if (pedido.phone_area && pedido.phone) {
              phoneNumber = `+55${pedido.phone_area}${pedido.phone}`;
            } else if (pedido.cellphone_area && pedido.cellphone) {
              phoneNumber = `+55${pedido.cellphone_area}${pedido.cellphone}`;
            }

            let erroOrdered = false;

            for (let j = 0; j < orderItems.length; j++) {
              const item = orderItems[j];

              let cleanReference = item.reference || item.sku || '';
              if (/_\d+_\d+_/.test(cleanReference)) {
                cleanReference = cleanReference.split('_')[0];
              }

              const imageUrl = item.picture_url
                ? (item.picture_url.startsWith('//') ? 'https:' + item.picture_url : item.picture_url)
                : '';

              const orderedProductEvent = {
                data: {
                  type: "event",
                  attributes: {
                    properties: {
                      "OrderId":     pedido.code || '',
                      "ProductID":   item.sku || item.reference || '',
                      "SKU":         item.sku || '',
                      "ProductName": item.product_name || '',
                      "Quantity":    parseInt(item.quantity) || 1,
                      "ItemPrice":   parseFloat(item.price) || 0,
                      "RowTotal":    parseFloat(item.total) || 0,
                      "ProductURL":  `${CONFIG.loja.url}/produtos/${cleanReference}`,
                      "ImageURL":    imageUrl,
                      "Categories":  item.attribute1 ? [item.attribute1] : [],
                      "Brand":       item.attribute3 || ''
                    },
                    time: orderTime,
                    value: parseFloat(item.total) || 0,
                    value_currency: "BRL",
                    unique_id: `${pedido.code}_${item.sku || item.reference || j}`,
                    metric: {
                      data: { type: "metric", attributes: { name: "Ordered Product" } }
                    },
                    profile: {
                      data: {
                        type: "profile",
                        attributes: { email: pedido.email || '', phone_number: phoneNumber }
                      }
                    }
                  }
                }
              };

              try {
                enviarParaKlaviyo(orderedProductEvent);
                Logger.log(`✅ Ordered Product enviado: ${pedido.code} - item ${j + 1}/${orderItems.length}`);
              } catch (itemErr) {
                Logger.log(`❌ Ordered Product erro item ${j}: ${itemErr.toString()}`);
                erroOrdered = true;
              }

              Utilities.sleep(500);
            }

            sheet.getRange(linha.rowNumber, 5).setValue(
              erroOrdered
                ? `⚠️ Enviado com erros parciais - ${dataHora}`
                : `✅ ${orderItems.length} item(s) enviado(s) - ${dataHora}`
            );

          } catch (err) {
            sheet.getRange(linha.rowNumber, 5).setValue(`❌ ${err.toString().substring(0, 180)} - ${dataHora}`);
            Logger.log(`❌ Ordered Product erro geral: ${err.toString()}`);
          }
          Utilities.sleep(500);
        }

        // 3. CRIAR/ATUALIZAR PERFIL E ADICIONAR À LISTA
        if (linha.perfilPendente) {
          try {
            const profileId = criarOuAtualizarPerfil(pedido);
            adicionarPerfilNaLista(profileId);
            sheet.getRange(linha.rowNumber, 6).setValue(`✅ Perfil atualizado e adicionado à lista - ${dataHora}`);
            Logger.log(`✅ Perfil/Lista atualizado: ${pedido.email}`);
          } catch (err) {
            sheet.getRange(linha.rowNumber, 6).setValue(`❌ ${err.toString().substring(0, 180)} - ${dataHora}`);
            Logger.log(`❌ Perfil/Lista erro: ${err.toString()}`);
          }
          Utilities.sleep(500);
        }

        processados++;

      } catch (error) {
        Logger.log(`❌ Erro geral linha ${linha.rowNumber}: ${error.toString()}`);
        erros++;
      }
    }

    Logger.log(`🎯 Processamento concluído: ${processados} processados, ${erros} erros`);

  } catch (error) {
    Logger.log("❌ ERRO GERAL: " + error.toString());

  } finally {
    try { lock.releaseLock(); Logger.log("🔓 Lock liberado"); }
    catch (e) { Logger.log("⚠️ Erro ao liberar lock: " + e.toString()); }
  }
}

// =============================================
// FUNÇÃO 3: PROCESSAR NEWSLETTER (Trigger 1h)
// =============================================
function processarFilaNewsletter() {
  const lock = LockService.getScriptLock();

  try {
    if (!lock.tryLock(5000)) {
      Logger.log("⏭️ Outra instância já está processando. Pulando execução.");
      return;
    }

    Logger.log("🔄 Iniciando processamento da fila de newsletter...");

    const ss = SpreadsheetApp.openById(CONFIG.planilha.id);
    const sheet = ss.getSheetByName("Forms Newsletter");

    if (!sheet) throw new Error('Aba "Forms Newsletter" não encontrada');

    const lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      Logger.log("📭 Fila de newsletter vazia");
      return;
    }

    const values = sheet.getRange(2, 1, lastRow - 1, 3).getValues();

    let processados = 0;
    let erros = 0;

    for (let i = 0; i < values.length; i++) {
      const rowNumber = i + 2;
      const rawEmail  = values[i][1];
      const status    = values[i][2];

      if (status && status.toString().includes('✅')) continue;

      // Limpa prefixo "email:" caso venha do Zapier ou similar
      const email = rawEmail.toString().replace(/^email:\s*/i, '').trim();

      if (!email || !email.includes('@')) {
        sheet.getRange(rowNumber, 3).setValue('⚠️ E-mail inválido');
        continue;
      }

      const dataHora = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), "yyyy-MM-dd HH:mm:ss");

      try {
        const profileId = criarOuAtualizarPerfilNewsletter(email);
        adicionarPerfilNaLista(profileId);
        sheet.getRange(rowNumber, 3).setValue(`✅ Adicionado à lista - ${dataHora}`);
        Logger.log(`✅ Newsletter processado: ${email} (${profileId})`);
        processados++;
      } catch (err) {
        sheet.getRange(rowNumber, 3).setValue(`❌ ${err.toString().substring(0, 180)} - ${dataHora}`);
        Logger.log(`❌ Erro newsletter ${email}: ${err.toString()}`);
        erros++;
      }

      Utilities.sleep(500);
    }

    Logger.log(`🎯 Newsletter concluído: ${processados} processados, ${erros} erros`);

  } catch (error) {
    Logger.log("❌ ERRO GERAL newsletter: " + error.toString());

  } finally {
    try { lock.releaseLock(); Logger.log("🔓 Lock liberado"); }
    catch (e) { Logger.log("⚠️ Erro ao liberar lock: " + e.toString()); }
  }
}

// =============================================
// FUNÇÃO: CRIAR OU ATUALIZAR PERFIL (Pedido)
// =============================================
function criarOuAtualizarPerfil(pedido) {
  let phoneNumber = '';
  if (pedido.phone_area && pedido.phone) {
    phoneNumber = `+55${pedido.phone_area}${pedido.phone}`;
  } else if (pedido.cellphone_area && pedido.cellphone) {
    phoneNumber = `+55${pedido.cellphone_area}${pedido.cellphone}`;
  }

  const payload = {
    data: {
      type: "profile",
      attributes: {
        email: pedido.email || '',
        phone_number: phoneNumber || undefined,
        first_name: pedido.first_name || '',
        last_name: pedido.last_name || '',
        location: {
          address1: pedido.street_name || '',
          address2: pedido.complement || '',
          city: pedido.city || '',
          region: pedido.state || '',
          country: 'BR',
          zip: pedido.zip || ''
        }
      }
    }
  };

  return _enviarPerfil(payload);
}

// =============================================
// FUNÇÃO: CRIAR OU ATUALIZAR PERFIL (Newsletter)
// =============================================
function criarOuAtualizarPerfilNewsletter(email) {
  const payload = {
    data: {
      type: "profile",
      attributes: {
        email: email,
        properties: { source: "newsletter" }
      }
    }
  };

  return _enviarPerfil(payload);
}

// =============================================
// FUNÇÃO INTERNA: ENVIAR PERFIL À API
// =============================================
function _enviarPerfil(payload) {
  const options = {
    method: "post",
    headers: {
      "Authorization": `Klaviyo-API-Key ${CONFIG.klaviyo.apiKey}`,
      "Accept": "application/json",
      "Content-Type": "application/json",
      "revision": CONFIG.klaviyo.revision
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(CONFIG.klaviyo.profilesUrl, options);
  const statusCode = response.getResponseCode();
  const responseBody = response.getContentText();

  Logger.log(`📡 Profiles API: HTTP ${statusCode}`);

  if (statusCode === 201 || statusCode === 409) {
    const data = JSON.parse(responseBody);

    if (statusCode === 409) {
      const duplicateId = data.errors?.[0]?.meta?.duplicate_profile_id;
      if (duplicateId) {
        Logger.log(`ℹ️ Perfil já existe: ${duplicateId}`);
        return duplicateId;
      }
    }

    const profileId = data.data?.id;
    if (!profileId) throw new Error("Profile ID não retornado pela API");
    Logger.log(`✅ Perfil criado/atualizado: ${profileId}`);
    return profileId;
  }

  throw new Error(`Profiles API Error: HTTP ${statusCode} - ${responseBody}`);
}

// =============================================
// FUNÇÃO: ADICIONAR PERFIL NA LISTA
// =============================================
function adicionarPerfilNaLista(profileId) {
  const url = `https://a.klaviyo.com/api/lists/${CONFIG.klaviyo.listId}/relationships/profiles/`;

  const options = {
    method: "post",
    headers: {
      "Authorization": `Klaviyo-API-Key ${CONFIG.klaviyo.apiKey}`,
      "Accept": "application/json",
      "Content-Type": "application/json",
      "revision": CONFIG.klaviyo.revision
    },
    payload: JSON.stringify({ data: [{ type: "profile", id: profileId }] }),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(url, options);
  const statusCode = response.getResponseCode();

  Logger.log(`📡 List API: HTTP ${statusCode}`);

  if (statusCode === 204) {
    Logger.log(`✅ Perfil ${profileId} adicionado à lista`);
    return;
  }

  if (statusCode === 400 && response.getContentText().includes("already a member")) {
    Logger.log(`ℹ️ Perfil já está na lista`);
    return;
  }

  throw new Error(`List API Error: HTTP ${statusCode} - ${response.getContentText()}`);
}

// =============================================
// FUNÇÃO: MONTAR EVENTO KLAVIYO (Placed Order)
// =============================================
function montarEventoKlaviyo(pedido) {
  const items = (pedido.items || []).map(item => {
    let cleanReference = item.reference || item.sku || '';
    if (/_\d+_\d+_/.test(cleanReference)) cleanReference = cleanReference.split('_')[0];

    const productUrl = `${CONFIG.loja.url}/produtos/${cleanReference}`;
    const imageUrl = item.picture_url
      ? (item.picture_url.startsWith('//') ? 'https:' + item.picture_url : item.picture_url)
      : '';

    return {
      ProductID:   item.sku || item.reference || '',
      SKU:         item.sku || '',
      ProductName: item.product_name || '',
      Quantity:    parseInt(item.quantity) || 1,
      ItemPrice:   parseFloat(item.price) || 0,
      RowTotal:    parseFloat(item.total) || 0,
      ProductURL:  productUrl,
      ImageURL:    imageUrl,
      Categories:  item.attribute1 ? [item.attribute1] : [],
      Brand:       item.attribute3 || ''
    };
  });

  const itemNames = items.map(i => i.ProductName).filter(Boolean);
  const categories = [];
  const brands = [];

  items.forEach(item => {
    (item.Categories || []).forEach(cat => {
      if (cat && !categories.includes(cat)) categories.push(cat);
    });
    if (item.Brand && !brands.includes(item.Brand)) brands.push(item.Brand);
  });

  let phoneNumber = '';
  if (pedido.phone_area && pedido.phone) {
    phoneNumber = `+55${pedido.phone_area}${pedido.phone}`;
  } else if (pedido.cellphone_area && pedido.cellphone) {
    phoneNumber = `+55${pedido.cellphone_area}${pedido.cellphone}`;
  }

  const shippingAddress = pedido.shipping_address || {};

  let orderTime = pedido.confirmed_at || pedido.received_at || new Date().toISOString();
  try {
    const dt = new Date(orderTime);
    orderTime = isNaN(dt.getTime()) ? new Date().toISOString() : dt.toISOString();
  } catch (e) { orderTime = new Date().toISOString(); }

  const properties = {
    "OrderId":   pedido.code || '',
    "Categories": categories,
    "ItemNames":  itemNames,
    "Brands":     brands,
    "Items":      items
  };

  if (pedido.coupon_code) {
    properties.DiscountCode  = pedido.coupon_code;
    properties.DiscountValue = parseFloat(pedido.discount_price) || 0;
  }

  if (shippingAddress.street_name || pedido.street_name) {
    properties.ShippingAddress = {
      FirstName:   shippingAddress.first_name || pedido.first_name || '',
      LastName:    shippingAddress.last_name  || pedido.last_name  || '',
      Address1:    shippingAddress.street_name || pedido.street_name || '',
      Address2:    shippingAddress.complement  || pedido.complement  || '',
      City:        shippingAddress.city  || pedido.city  || '',
      RegionCode:  shippingAddress.state || pedido.state || '',
      CountryCode: 'BR',
      Zip:         shippingAddress.zip || pedido.zip || ''
    };
  }

  if (pedido.extra) {
    if (pedido.extra.DataDeEntrega) properties.DataDeEntrega = pedido.extra.DataDeEntrega;
    if (pedido.extra.Periodo)       properties.Periodo       = pedido.extra.Periodo;
    if (pedido.extra.Mensagem)      properties.Mensagem      = pedido.extra.Mensagem;
  }

  return {
    data: {
      type: "event",
      attributes: {
        properties,
        time: orderTime,
        value: parseFloat(pedido.total) || 0,
        value_currency: "BRL",
        unique_id: pedido.code,
        metric: {
          data: { type: "metric", attributes: { name: "Placed Order" } }
        },
        profile: {
          data: {
            type: "profile",
            attributes: {
              email:        pedido.email || '',
              phone_number: phoneNumber,
              first_name:   pedido.first_name || '',
              last_name:    pedido.last_name  || '',
              location: {
                address1: pedido.street_name || '',
                address2: pedido.complement  || '',
                city:     pedido.city  || '',
                region:   pedido.state || '',
                country:  'BR',
                zip:      pedido.zip   || ''
              }
            }
          }
        }
      }
    }
  };
}

// =============================================
// FUNÇÃO: ENVIAR EVENTO PARA KLAVIYO
// =============================================
function enviarParaKlaviyo(evento) {
  const options = {
    method: "post",
    headers: {
      "Authorization": `Klaviyo-API-Key ${CONFIG.klaviyo.apiKey}`,
      "Accept": "application/json",
      "Content-Type": "application/json",
      "revision": CONFIG.klaviyo.revision
    },
    payload: JSON.stringify(evento),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(CONFIG.klaviyo.apiUrl, options);
  const statusCode = response.getResponseCode();

  Logger.log(`📡 Klaviyo response: HTTP ${statusCode}`);

  if ([200, 201, 202].includes(statusCode)) return statusCode;

  throw new Error(`Klaviyo API Error: HTTP ${statusCode} - ${response.getContentText()}`);
}

// =============================================
// FUNÇÕES: TRIGGERS
// =============================================
function criarTriggerHorario() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'processarFilaKlaviyo')
    .forEach(t => ScriptApp.deleteTrigger(t));

  ScriptApp.newTrigger('processarFilaKlaviyo').timeBased().everyHours(1).create();
  Logger.log("✅ Trigger criado: processarFilaKlaviyo a cada 1 hora");
}

function criarTriggerNewsletter() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'processarFilaNewsletter')
    .forEach(t => ScriptApp.deleteTrigger(t));

  ScriptApp.newTrigger('processarFilaNewsletter').timeBased().everyHours(1).create();
  Logger.log("✅ Trigger criado: processarFilaNewsletter a cada 1 hora");
}

// =============================================
// FUNÇÃO: GET (health check)
// =============================================
function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    status: "online",
    timestamp: new Date().toISOString()
  })).setMimeType(ContentService.MimeType.JSON);
}

// =============================================
// FUNÇÕES DE TESTE
// =============================================
function testarWebhook() {
  const pedidoTeste = {
    id: 99999,
    code: "TESTE" + Date.now(),
    status: "confirmed",
    first_name: "João",
    last_name: "Silva",
    email: "joao.teste@example.com",
    phone_area: "11",
    phone: "987654321",
    zip: "01310100",
    street_name: "Avenida Paulista",
    street_number: "1000",
    complement: "Apto 101",
    city: "São Paulo",
    state: "SP",
    confirmed_at: new Date().toISOString(),
    total: 250.00,
    items: [{
      sku: "PROD001",
      reference: "ref-001",
      product_name: "Produto Teste",
      quantity: 1,
      price: 250.00,
      total: 250.00,
      picture_url: "//cdn.vnda.com.br/test.jpg",
      attribute1: "Categoria Teste",
      attribute3: "Marca Teste"
    }]
  };

  const resultado = doPost({ postData: { contents: JSON.stringify(pedidoTeste) } });
  Logger.log("✅ Resultado: " + resultado.getContent());
}

function testarProcessamentoFila() {
  Logger.log("🧪 Iniciando teste...");
  processarFilaKlaviyo();
  Logger.log("✅ Teste concluído");
}

// =============================================
// MENU CUSTOMIZADO
// =============================================
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🔄 Klaviyo')
    .addItem('🧪 Testar Webhook',           'testarWebhook')
    .addItem('🧪 Processar Fila Agora',     'testarProcessamentoFila')
    .addItem('⏰ Criar Trigger Pedidos (1h)', 'criarTriggerHorario')
    .addSeparator()
    .addItem('📧 Processar Newsletter Agora', 'processarFilaNewsletter')
    .addItem('⏰ Criar Trigger Newsletter',   'criarTriggerNewsletter')
    .addSeparator()
    .addItem('📋 Verificar Configuração',    'verificarConfiguracao')
    .addToUi();
}

// =============================================
// FUNÇÃO: VERIFICAR CONFIGURAÇÃO
// =============================================
function verificarConfiguracao() {
  const ui = SpreadsheetApp.getUi();

  try {
    const ss    = SpreadsheetApp.openById(CONFIG.planilha.id);
    const sheet = ss.getSheetByName(CONFIG.planilha.aba);
    const sheetNewsletter = ss.getSheetByName("Forms Newsletter");

    if (!sheet) {
      ui.alert('❌ Erro', `Aba "${CONFIG.planilha.aba}" não encontrada!`, ui.ButtonSet.OK);
      return;
    }

    ui.alert('✅ Verificação', [
      `Planilha: ${ss.getName()}`,
      `Aba pedidos: ${CONFIG.planilha.aba} (${sheet.getLastRow() - 1} registros)`,
      `Aba newsletter: ${sheetNewsletter ? `Forms Newsletter (${sheetNewsletter.getLastRow() - 1} registros)` : '❌ não encontrada'}`,
      `URL Loja: ${CONFIG.loja.url}`,
      `List ID: ${CONFIG.klaviyo.listId}`,
      `API Key: ${CONFIG.klaviyo.apiKey.substring(0, 20)}...`
    ].join('\n'), ui.ButtonSet.OK);

  } catch (error) {
    ui.alert('❌ Erro', error.toString(), ui.ButtonSet.OK);
  }
}
