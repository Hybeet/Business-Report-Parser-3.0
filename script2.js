//Unicode Normalization Interceptor
function normalizeText(text) {
    if (!text) return "";
    return text.normalize('NFKD').replace(/[\u{1D400}-\u{1D7FF}]/gu, char => {
        const code = char.codePointAt(0);
        if (code >= 0x1D670 && code <= 0x1D689) return String.fromCharCode(code - 0x1D670 + 65);
        if (code >= 0x1D68A && code <= 0x1D6A3) return String.fromCharCode(code - 0x1D68A + 97);
        if (code >= 0x1D7f6 && code <= 0x1D7FF) return String.fromCharCode(code - 0x1D7F6 + 48);
        return char;
    });
} 

//Global Variables to securely cache a raw paste box metadata value
let extractedMarketName = "Unknown Market"; 
let extractedReportDate = ""; 
    
function getFormattedCurrentdate()  {
    const today = new Date();
    const day = String(today.getDate() - 1).padStart(2, '0');
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const year = today.getFullYear();
    return `${day}/${month}/${year}`;
}

// --- EXTRACTION LOGIC ---
function extractData() {
    const rawText = document.getElementById('reportInput').value;
    const text = normalizeText(rawText);
    const missingWords = [];

    extractedReportDate = getFormattedCurrentdate();

    // 1. DEDICATED TEXT EXTRACTION ENGINE (For Dates & Market Names)
    const dateMatch = text.match(/(?:Date):?\s*[^0-9]*([0-9]{1,2}\/[0-9]{1,2}\/[0-9]{4})/i);
    if (dateMatch) {
        extractedReportDate = dateMatch[1].trim();
    }

    // New clean strategy: look for "Market/Location", "Location", "Market", or "Branch" 
    // and grab the text words following it up to the end of that text line.
    //const marketMatch = text.match(/(?:Market[a-z]*\/Location[a-z]*|Location[a-z]*|Market[a-z]*|Branch[a-z]*):?\s*([A-Za-z0-9\s._-]+)/i);
    const marketRegex = /(?:Marke[a-z]*|Location[a-z]*)+(?:\/|Location[a-z]*)*[^A-Za-z0-9\n]*([A-Za-z0-9\s._-]+)/i;
    const marketMatch = text.match(marketRegex);

    if (marketMatch && marketMatch[1].trim() !== "") {
        extractedMarketName = marketMatch[1].trim();
    } else {
        extractedMarketName = "Unknown Market";
        missingWords.push("Market Name");
    }

    // Dynamically update the UI preview elements 
    if (document.getElementById('displayDate')) document.getElementById('displayDate').value = extractedReportDate;
    if (document.getElementById('displayMarket')) document.getElementById('displayMarket').value = extractedMarketName;
    
    // 2. NUMERIC VALUE EXTRACTOR (Stays strict to numbers only)
    const getValue = (keyword) => {
        const regex = new RegExp(`${keyword}[^0-9\\n]*([0-9,.]+)`, 'i');
        const match = text.match(regex);
        if (match) {
            return parseFloat(match[1].replace(/,/g, ''));
        } else {
            missingWords.push(keyword.replace("[a-z]*","").replace(".s","'s"));
            return ""; 
        }
    };

    // Auto-map report text numbers to Form IDs
    const mapping = {
        'openingCash': getValue("Opening Cash[a-z]*"),
        'todayPd': getValue("Today.s Pa[a-z]*"),
        'officecash': getValue("Cash fro[a-z]*"),
        'supposeColl': getValue("Suppos[a-z]* Collection"),
        'supposeColl2': getValue("Suppos[a-z]* Collection"),
        'recovery': getValue("Recov[a-z]*"),
        'recovery2': getValue("Recov[a-z]*"),
        'interestOnDeals': getValue("Intere[a-z]* on Deals"),
        'formsSold': getValue("daily forms sold"),
        'cardsSold': getValue("daily cards sold"),
        'payOff': getValue("pay[a-z]* off collected Today"),
        'TotalDeposit': getValue("Total Deposits to Bank"),
        'defaultAmt': getValue("Default"),
        'defaultAmt2': getValue("Default"),
        'costOfDeals': getValue("Cost of Deals"),
        'usedPd': getValue("Used Pay down"),
        'inheritedoutstanding': getValue("Inherited Outstanding"),
        'myoutstanding': getValue("My Outstanding")
    };

    // Fill the form fields with extracted numbers
    for (const [elementId, extractedValue] of Object.entries(mapping)) {
        const element = document.getElementById(elementId);
        if (element) {
            element.value = extractedValue;
        }
    }

    // Show warnings if fields were missing from pasted text
    const errorBox = document.getElementById('errorBox');
    const missingList = document.getElementById('missingList');
    if (missingWords.length > 0) {
        errorBox.classList.remove('hidden');
        missingList.innerHTML = missingWords.map(field => `<li>${field}</li>`).join("");
    } else {
        errorBox.classList.add('hidden');
    }
}

// --- CALCULATION LOGIC & GOOGLE SHEETS TRANSMISSION ---
function runCalculation() {
    const getVal = (id) => parseFloat(document.getElementById(id).value) || 0;

    const data = {
        opening: getVal('openingCash'),
        frmoffice: getVal('officecash'),
        suppose: getVal('supposeColl'),
        recovery: getVal('recovery'),
        interest: getVal('interestOnDeals'),
        forms: getVal('formsSold'),
        cards: getVal('cardsSold'),
        payoff: getVal('payOff'),
        deposit: getVal('TotalDeposit'),
        defaultAmt: getVal('defaultAmt'),
        deals: getVal('costOfDeals'),
        todayPd: getVal('todayPd'),
        usedPd: getVal('usedPd'),
        inheritedOut: getVal('inheritedoutstanding'), 
        myOut: getVal('myoutstanding'),               
        calcCell2: getVal('calcCell2'),
        calcCell3: getVal('calcCell3')
    };

    if (data.suppose === 0 && data.opening === 0) {
        alert("⚠️ Form verification failed. Please enter essential metrics before calculating.");
        return;
    }

    const totalCash = (
        data.opening + 
        data.frmoffice + 
        data.suppose + 
        data.recovery + 
        data.interest + 
        data.forms + 
        data.cards + 
        data.payoff + 
        data.todayPd - 
        data.usedPd
    ) - (
        data.deposit + 
        data.defaultAmt + 
        data.deals);
    const actualCollection = (
        data.suppose - 
        data.defaultAmt + 
        data.recovery + 
        data.payoff + 
        data.todayPd - 
        data.usedPd);
    const computedNextDayCollection = data.suppose - data.calcCell2 + data.calcCell3;
    const computedTotalOutstanding = data.inheritedOut + data.myOut + data.defaultAmt - data.recovery;

    document.getElementById('nextDayCollection').innerText = "₦" + computedNextDayCollection.toLocaleString();
    document.getElementById('outstandingResult').innerText = "₦" + computedTotalOutstanding.toLocaleString();

    const isReportComplete = document.getElementById('errorBox').classList.contains('hidden');
    const currentReportStatus = isReportComplete ? "Complete" : "Incomplete (Missing Metrics)";

    document.getElementById('dashboard').classList.remove('hidden');
    document.getElementById('totalCashDisplay').innerText = "₦" + totalCash.toLocaleString();
    document.getElementById('actualDisplay').innerText = "₦" + actualCollection.toLocaleString();

    let tableHTML = `<table>
        <tr><th>Description</th><th>Amount / Information</th></tr>
        <tr><td>REPORT DATE</td><td>${extractedReportDate}</td></tr>
        <tr><td>MARKET NAME</td><td><strong>${extractedMarketName}</strong></td></tr>
        <tr><td>OPENING CASH</td><td>₦${data.opening.toLocaleString()}</td></tr>
        <tr><td>SUPPOSED COLLECTION</td><td>₦${data.suppose.toLocaleString()}</td></tr>
        <tr><td>ACTUAL COLLECTION</td><td style="font-weight:bold;">₦${actualCollection.toLocaleString()}</td></tr>
        <tr><td>TOTAL CASH TODAY</td><td style="font-weight:bold;">₦${totalCash.toLocaleString()}</td></tr>
        <tr><td>TOTAL OUTSTANDING</td><td>₦${computedTotalOutstanding.toLocaleString()}</td></tr>
        <tr><td>NEXT DAY COLLECTION</td><td>₦${computedNextDayCollection.toLocaleString()}</td></tr>
        <tr><td>STATUS</td><td><strong>${currentReportStatus}</strong></td></tr>
    </table>`;
    document.getElementById('tableContainer').innerHTML = tableHTML;

    const spreadsheetDataPayload = {
        date: extractedReportDate,          
        marketName: extractedMarketName,    
        openingCash: data.opening,          
        supposeColl: data.suppose,          
        actualCollection: actualCollection,  
        totalCashToday: totalCash,          
        totalOutstanding: computedTotalOutstanding, 
        nextDayCollection: computedNextDayCollection, 
        status: currentReportStatus         
    };

    const GOOGLE_SHEETS_API_ENDPOINT = "https://script.google.com/macros/s/AKfycby650cmbTN291QwEtcTFaVWIjMzYGT_Y8RXvsdTlqx0keybk7Aw8rR0O6QQ5OWj0ziG/exec";

    fetch(GOOGLE_SHEETS_API_ENDPOINT, {
        method: "POST",
        mode: "no-cors", 
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(spreadsheetDataPayload)
    })
    .then(() => alert(`✅ Financial data ledger safely synced for ${extractedMarketName} on ${extractedReportDate}!`))
    .catch(err => console.error("Data transmission exception:", err));
}

//Next Day Collection Calc
function runNextDayCalc() {
    const cell1 = parseFloat(document.getElementById('supposeColl2').value) || 0;
    const cell2 = parseFloat(document.getElementById('calcCell2').value) || 0;
    const cell3 = parseFloat(document.getElementById('calcCell3').value) || 0;
    const sumtotal = cell1 - cell2 + cell3;
    document.getElementById('nextDayCollection').innerText = "₦" + sumtotal.toLocaleString();
}

//Outstanding Calc
function runOutstandingCalc() {
    const outCell1 = parseFloat(document.getElementById('inheritedoutstanding').value) || 0;
    const outCell2 = parseFloat(document.getElementById('myoutstanding').value) || 0;
    const outCell3 = parseFloat(document.getElementById('defaultAmt2').value) || 0;
    const outCell4 = parseFloat(document.getElementById('recovery2').value) || 0;
    const sumtotal = outCell1 + outCell2 + outCell3 - outCell4;
    document.getElementById('outstandingResult').innerText = "₦" + sumtotal.toLocaleString();
}

// Event Listeners
document.getElementById('autoFillBtn').addEventListener('click', extractData);
document.getElementById('calculateBtn').addEventListener('click', runCalculation);
document.getElementById('calcNextDayBtn').addEventListener('click', runNextDayCalc);
document.getElementById('calcOutstandingBtn').addEventListener('click', runOutstandingCalc);