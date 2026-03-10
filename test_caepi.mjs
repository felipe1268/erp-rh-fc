// Test scraping caepi.mte.gov.br - minimal approach
async function testCAEPI() {
  try {
    const headers = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
    };

    // Step 1: Get initial page
    const initRes = await fetch("https://caepi.mte.gov.br/internet/consultacainternet.aspx", { headers });
    const initHtml = await initRes.text();
    
    const vs = initHtml.match(/id="__VIEWSTATE"\s+value="([^"]*)"/)?.[1];
    const vsg = initHtml.match(/id="__VIEWSTATEGENERATOR"\s+value="([^"]*)"/)?.[1];
    const ev = initHtml.match(/id="__EVENTVALIDATION"\s+value="([^"]*)"/)?.[1];
    
    const cookieStr = initRes.headers.getSetCookie 
      ? initRes.headers.getSetCookie().map(c => c.split(";")[0]).join("; ")
      : "";
    
    // Step 2: Submit ONLY the fields that exist in the initial form
    // DO NOT include ctl00$ScriptManager1 - it's not a regular form field
    const formData = new URLSearchParams();
    formData.append("__EVENTTARGET", "");
    formData.append("__EVENTARGUMENT", "");
    formData.append("__VIEWSTATE", vs);
    formData.append("__VIEWSTATEGENERATOR", vsg);
    formData.append("__EVENTVALIDATION", ev);
    formData.append("ctl00$PlaceHolderConteudo$txtNumeroCA", "15532");
    formData.append("ctl00$PlaceHolderConteudo$cboEquipamento", "");
    formData.append("ctl00$PlaceHolderConteudo$cboFabricante", "");
    formData.append("ctl00$PlaceHolderConteudo$cboTipoProtecao", "");
    formData.append("ctl00$PlaceHolderConteudo$btnConsultar", "Consultar");
    
    const searchRes = await fetch("https://caepi.mte.gov.br/internet/consultacainternet.aspx", {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/x-www-form-urlencoded",
        "Cookie": cookieStr,
        "Referer": "https://caepi.mte.gov.br/internet/consultacainternet.aspx",
        "Origin": "https://caepi.mte.gov.br",
      },
      body: formData.toString(),
      redirect: "follow",
    });
    
    const searchHtml = await searchRes.text();
    console.log("Search status:", searchRes.status);
    
    if (searchRes.status === 500) {
      console.log("Server error - trying without ScriptManager and with different select defaults...");
      
      // Try with default select values that match the page
      const formData2 = new URLSearchParams();
      formData2.append("__EVENTTARGET", "");
      formData2.append("__EVENTARGUMENT", "");
      formData2.append("__VIEWSTATE", vs);
      formData2.append("__VIEWSTATEGENERATOR", vsg);
      formData2.append("__EVENTVALIDATION", ev);
      formData2.append("ctl00$PlaceHolderConteudo$txtNumeroCA", "15532");
      // Use the default "*******Selecione*******" value from the dropdowns
      const defaultSelectVal = "";
      formData2.append("ctl00$PlaceHolderConteudo$cboEquipamento", defaultSelectVal);
      formData2.append("ctl00$PlaceHolderConteudo$cboFabricante", defaultSelectVal);
      formData2.append("ctl00$PlaceHolderConteudo$cboTipoProtecao", defaultSelectVal);
      formData2.append("ctl00$PlaceHolderConteudo$btnConsultar", "Consultar");
      
      // Check what the actual default option values are
      const eqDefault = initHtml.match(/id="PlaceHolderConteudo_cboEquipamento"[^>]*>[\s\S]*?<option[^>]*value="([^"]*)"/)?.[1];
      const fabDefault = initHtml.match(/id="PlaceHolderConteudo_cboFabricante"[^>]*>[\s\S]*?<option[^>]*value="([^"]*)"/)?.[1];
      const tpDefault = initHtml.match(/id="PlaceHolderConteudo_cboTipoProtecao"[^>]*>[\s\S]*?<option[^>]*value="([^"]*)"/)?.[1];
      
      console.log("Default select values:", { eqDefault, fabDefault, tpDefault });
      
      // Also check the ScriptManager hidden field value
      const smMatch = initHtml.match(/name="ctl00\$ScriptManager1"[^>]*value="([^"]*)"/);
      console.log("ScriptManager value:", smMatch ? smMatch[1] : "NOT FOUND");
      
      // Check if there's a __SCROLLPOSITIONX/Y
      const scrollX = initHtml.match(/id="__SCROLLPOSITIONX"\s+value="([^"]*)"/)?.[1];
      const scrollY = initHtml.match(/id="__SCROLLPOSITIONY"\s+value="([^"]*)"/)?.[1];
      console.log("Scroll:", { scrollX, scrollY });
    }
    
    console.log("Has results:", searchHtml.includes("grdListaResultado"));
    console.log("Has 15532:", searchHtml.includes(">15532<"));
    
    if (searchRes.status !== 500 && searchHtml.includes(">15532<")) {
      console.log("SUCCESS! Results found.");
    }
    
  } catch (err) {
    console.error("Error:", err.message);
  }
}

testCAEPI();
