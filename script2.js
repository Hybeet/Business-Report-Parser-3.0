// Unicode Normalization Interceptor
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

// Global Variables to securely cache a raw paste box metadata value
let extractedMarketName = "Unknown Market"; 
let extractedReportDate = ""; 
// Global variable to hold sheet data cache for the active extraction session
let cachedSheetHistory = null;
    
// Helper Function to cleanly format any Date Object to DD/MM/YYYY
function formatDateToString(dateObj) {
    const day = String(dateObj.getDate()).padStart(2, '0');
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const year = dateObj.getFullYear();
    return `${day}/${month}/${year}`;
}

// Generates the current calendar date as a dynamic fallback string
function getFormattedCurrentdate() {
    const today = new Date();
    return formatDateToString(today);
}

// --- EXTRACTION LOGIC ---
function extractData() {
    const rawText = document.getElementById('reportInput').value;
    const text = normalizeText(rawText);
    const missingWords = [];

    // Reset extraction warning boxes and cache data states cleanly
    const extractWarningBox = document.getElementById('extraction-mismatch-flag');
    if (extractWarningBox) extractWarningBox.style.display = "none";
    const systemOverrideBox = document.getElementById('sheet-correction-override');
    if (systemOverrideBox) systemOverrideBox.checked = false; 
    cachedSheetHistory = null;

    // Set dynamic default fallback date
    extractedReportDate = getFormattedCurrentdate();

    // 1. DEDICATED TEXT EXTRACTION ENGINE (For Dates & Market Names)
    const dateRegex = /Date[^*:\n]*[*:]*\s*([0-9]{1,2}\/[0-9]{1,2}\/([0-9]{2,4}))/i;
    const dateMatch = text.match(dateRegex);
    if (dateMatch) {
        let matchedDate = dateMatch[1].trim(); 
        let parts = matchedDate.split('/');
        let day = parts[0].padStart(2, '0');
        let month = parts[1].padStart(2, '0');
        let year = parts[2];
        
        if (year.length === 2) {
            year = '20' + year;
        }
        extractedReportDate = `${day}/${month}/${year}`; 
    } else {
        missingWords.push("Report Date");
    }

    const marketRegex = /(?:Marke[a-z]*|Locat[a-z]*)[^*:\n]*[*:]*\s*([A-Za-z0-9\s._-]+)/i;
    const marketMatch = text.match(marketRegex);
    
    // First, run the local raw text parsing map so fields exist for comparison
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

    const mapping = {
        'openingCash': getValue("Opening Cash[a-z]*"),
        'openingpd': getValue("Opening Pa[a-z]*"),
        'todayPd': getValue("Today.s Pa[a-z]*"),
        'officecash': getValue("Cash fro[a-z]*"),
        'supposeColl': getValue("Suppos[a-z]* Collection"),
        'supposeColl2': getValue("Suppos[a-z]* Collection"),
        'recovery': getValue("Recov[a-z]*"),
        'recovery2': getValue("Recov[a-z]*"),
        'interestOnDeals': getValue("Intere[a-z]*"),
        'formsSold': getValue("daily forms sold"),
        'cardsSold': getValue("daily cards sold"),
        'payOff': getValue("pay[a-z]* off collected Today"),
        'payOff2': getValue("pay[a-z]* off collected Today"),
        'TotalDeposit': getValue("Total Deposits to Bank"),
        'defaultAmt': getValue("Default"),
        'defaultAmt2': getValue("Default"),
        'costOfDeals': getValue("Cos[a-z]*"),
        'usedPd': getValue("Use[a-z]* Pa"),
        'previousoutstanding': getValue("Prev[a-z]*. Outstan"),
        'inheritedoutstanding': getValue("Inherited Outstanding"),
        'myoutstanding': getValue("My Outstanding")
    };

    for (const [elementId, extractedValue] of Object.entries(mapping)) {
        const element = document.getElementById(elementId);
        if (element) {
            element.value = extractedValue;
        }
    }

    // New Deals Automation allocation
    const costOfDealsElement = document.getElementById('costOfDeals');
    const costOfDealsVal = costOfDealsElement ? (parseFloat(costOfDealsElement.value) || 0) : 0;
    const computedNewDealInstallment = costOfDealsVal / 25;
    
    const calcCell3Input = document.getElementById('calcCell3');
    if (calcCell3Input) {
        calcCell3Input.value = computedNewDealInstallment.toFixed(2);
    }

    // Run underlying sub-calculators to update all side nodes before matching values
    if (typeof runNextDayCalc === "function") runNextDayCalc();
    if (typeof runOutstandingCalc === "function") runOutstandingCalc();

    if (marketMatch && marketMatch[1].trim() !== "") {
        let rawMarket = marketMatch[1].trim();
        extractedMarketName = rawMarket.toLowerCase().replace(/\b\w/g, char => char.toUpperCase());
    } else {
        extractedMarketName = "Unknown Market";
        missingWords.push("Market Name");
    }    

    if (document.getElementById('displayDate')) document.getElementById('displayDate').value = extractedReportDate;
    if (document.getElementById('displayMarket')) document.getElementById('displayMarket').value = extractedMarketName;

    const errorBox = document.getElementById('errorBox');
    const missingList = document.getElementById('missingList');
    if (missingWords.length > 0) {
        errorBox.classList.remove('hidden');
        missingList.innerHTML = missingWords.map(field => `<li>${field}</li>`).join("");
    } else {
        errorBox.classList.add('hidden');
    }

    // 🛡️ TRIGGER COMPLIANCE ENGINE FETCH AFTER ALL INPUTS ARE FULLY POPULATED
    if (extractedMarketName !== "Unknown Market") {
        const GOOGLE_SHEETS_API_ENDPOINT = "https://script.google.com/macros/s/AKfycbzpixGUMPZQ49tCjUdztkFY2orZDGmw4KOodufl3WE0W83FUpfewh5vskTGH6TP7GD1/exec";
        
        fetch(`${GOOGLE_SHEETS_API_ENDPOINT}?market=${encodeURIComponent(extractedMarketName)}&excludeDate=${encodeURIComponent(extractedReportDate)}`)
            .then(response => response.json())
            .then(data => {
                if (data.status === "success") {
                    cachedSheetHistory = data;

                    const openingCashInput = document.getElementById('openingCash');
                    const supposeCollInput = document.getElementById('supposeColl');
                    const previousOutstandingInput = document.getElementById('previousoutstanding');

                    let correctionRequired = false;
                    let mismatchDetails = [];

                    // 1️⃣ RULE: Today's Opening Cash vs Yesterday's Total Cash Today
                    const currentOpeningCash = parseFloat(openingCashInput.value) || 0;
                    const targetOpeningCash = parseFloat(data.expectedOpeningCash) || 0;
                    if (currentOpeningCash !== targetOpeningCash) {
                        correctionRequired = true;
                        mismatchDetails.push(`Opening Cash Mismatch (Extracted: ₦${currentOpeningCash.toLocaleString()} vs Sheet Total Cash Today: ₦${targetOpeningCash.toLocaleString()})`);
                    }

                    // 2️⃣ RULE: Today's Supposed Collection vs Yesterday's Next Day Collection
                    const currentSupposedColl = parseFloat(supposeCollInput.value) || 0;
                    const targetSupposedColl = parseFloat(data.expectedSupposedCollection) || 0;
                    if (currentSupposedColl !== targetSupposedColl) {
                        correctionRequired = true;
                        mismatchDetails.push(`Supposed Collection Mismatch (Extracted: ₦${currentSupposedColl.toLocaleString()} vs Sheet Next Day Collection: ₦${targetSupposedColl.toLocaleString()})`);
                    }

                    // 3️⃣ RULE: Today's Previous Outstanding vs Yesterday's Total Outstanding
                    const currentPrevOutstanding = parseFloat(previousOutstandingInput.value) || 0;
                    const targetPrevOutstanding = parseFloat(data.previousOutstanding) || 0;
                    if (currentPrevOutstanding !== targetPrevOutstanding) {
                        correctionRequired = true;
                        mismatchDetails.push(`Previous Outstanding Mismatch (Extracted: ₦${currentPrevOutstanding.toLocaleString()} vs Sheet Total Outstanding: ₦${targetPrevOutstanding.toLocaleString()})`);
                    }

                    // 🛡️ CONDITIONAL INSTANT WARNING COMPLIANCE PANEL FLAGGING
                    const warningDetailsText = document.getElementById('extraction-warning-details');
                    if (correctionRequired) {
                        if (extractWarningBox && warningDetailsText) {
                            warningDetailsText.innerHTML = `⚠️ <strong>Extraction Mismatch Flagged:</strong> The values parsed from the text report do not match your ledger record parameters on Google Sheets:<br><ul style="margin-top: 5px; padding-left: 20px; color: #78350f;"><li>` + 
                            mismatchDetails.join("</li><li>") + `</li></ul>Please confirm and check the box below to correct the form values using historical sheet data.`;
                            extractWarningBox.style.display = "block";
                        }
                    } else {
                        if (extractWarningBox) extractWarningBox.style.display = "none";
                    }
                }
            })
            .catch(err => console.error("Error pulling history payload:", err));
    }
}

// 🛡️ INTERACTIVE CHECKBOX OVERRIDE LISTENER
document.addEventListener('change', function(e) {
    if (e.target && e.target.id === 'sheet-correction-override') {
        if (e.target.checked && cachedSheetHistory) {
            const openingCashInput = document.getElementById('openingCash');
            const supposeCollInput = document.getElementById('supposeColl');
            const supposeColl2Input = document.getElementById('supposeColl2');
            const previousOutstandingInput = document.getElementById('previousoutstanding');

            if (cachedSheetHistory.expectedOpeningCash !== undefined && openingCashInput) {
                openingCashInput.value = cachedSheetHistory.expectedOpeningCash;
            }
            if (cachedSheetHistory.expectedSupposedCollection !== undefined) {
                if (supposeCollInput) supposeCollInput.value = cachedSheetHistory.expectedSupposedCollection;
                if (supposeColl2Input) supposeColl2Input.value = cachedSheetHistory.expectedSupposedCollection;
                if (typeof runNextDayCalc === "function") runNextDayCalc();
            }
            if (cachedSheetHistory.previousOutstanding !== undefined && previousOutstandingInput) {
                previousOutstandingInput.value = cachedSheetHistory.previousOutstanding;
                if (typeof runOutstandingCalc === "function") runOutstandingCalc();
            }
            console.log("✅ Confirmation approved: Form metrics overridden with historical tracking data.");
        }
    }
});

// --- CALCULATION LOGIC & GOOGLE SHEETS TRANSMISSION ---
async function runCalculation() {
    const getVal = (id) => parseFloat(document.getElementById(id).value) || 0;

    const warningFlag = document.getElementById('mismatch-warning-flag');
    const overwriteCheckbox = document.getElementById('overwrite-override-checkbox');    
    const isOverrideTicked = overwriteCheckbox ? overwriteCheckbox.checked : false;

    if (!isOverrideTicked && warningFlag) {
        warningFlag.style.display = "none";
    }

    const currentCostOfDeals = getVal('costOfDeals');
    const validatedNewDeals = currentCostOfDeals / 25;
    const calcCell3Field = document.getElementById('calcCell3');
    if (calcCell3Field) {
        calcCell3Field.value = validatedNewDeals.toFixed(2);
    }

    const data = {
        opening: getVal('openingCash'),
        openingpd: getVal('openingpd'),
        frmoffice: getVal('officecash'),
        suppose: getVal('supposeColl'),
        supposecoll2: getVal('supposeColl2'),
        recovery: getVal('recovery'),
        recovery2: getVal('recovery2'),
        interest: getVal('interestOnDeals'),
        forms: getVal('formsSold'),
        cards: getVal('cardsSold'),
        payoff: getVal('payOff'),
        payoff2: getVal('payOff2'),
        deposit: getVal('TotalDeposit'),
        defaultAmt: getVal('defaultAmt'),
        defaultAmt2: getVal('defaultAmt2'),
        deals: currentCostOfDeals,
        todayPd: getVal('todayPd'),
        usedPd: getVal('usedPd'),
        previousOut: getVal('previousoutstanding'),
        inheritedOut: getVal('inheritedoutstanding'), 
        myOut: getVal('myoutstanding'),               
        calcCell2: getVal('calcCell2'),
        calcCell3: validatedNewDeals
    };

    if (data.suppose === 0 && data.opening === 0) {
        alert("⚠️ Form verification failed. Please enter essential metrics before calculating.");
        return;
    }

    const totalCash = (
        data.opening + 
        data.openingpd + 
        data.frmoffice + 
        data.suppose + 
        data.recovery + 
        data.interest + 
        data.forms + 
        data.cards + 
        data.payoff + 
        data.todayPd
    ) - (
        data.usedPd + 
        data.deposit + 
        data.defaultAmt + 
        data.deals
    );

    const actualCollection = (
        data.suppose - 
        data.defaultAmt + 
        data.recovery + 
        data.payoff + 
        data.todayPd - 
        data.usedPd
    );

    const computedNextDayCollection = 
        data.supposecoll2 - (
        data.calcCell2 +
        data.payoff2 ) + 
        data.calcCell3;

    const computedTotalOutstanding = 
        data.previousOut + 
        data.defaultAmt2 - 
        data.recovery;

    const GOOGLE_SHEETS_API_ENDPOINT = "https://script.google.com/macros/s/AKfycbzpixGUMPZQ49tCjUdztkFY2orZDGmw4KOodufl3WE0W83FUpfewh5vskTGH6TP7GD1/exec";
    
    // 🛡️ STEP 2 COMPLIANCE LEDGER MISMATCH CHECK (FOR TOTALS & OUTPUTS)
    try {
        const verifyUrl = `${GOOGLE_SHEETS_API_ENDPOINT}?checkDate=${encodeURIComponent(extractedReportDate)}&checkMarket=${encodeURIComponent(extractedMarketName)}`;
        const checkResponse = await fetch(verifyUrl);
        const logStatus = await checkResponse.json();

        if (logStatus && logStatus.exists === true) {
            let varianceList = [];

            if (parseFloat(logStatus.actualCollection) !== actualCollection) {
                varianceList.push(`Actual Collection (Sheet: ₦${parseFloat(logStatus.actualCollection).toLocaleString()} vs Input: ₦${actualCollection.toLocaleString()})`);
            }
            if (parseFloat(logStatus.totalCashToday) !== totalCash) {
                varianceList.push(`Total Cash Today (Sheet: ₦${parseFloat(logStatus.totalCashToday).toLocaleString()} vs Input: ₦${totalCash.toLocaleString()})`);
            }
            if (parseFloat(logStatus.totalOutstanding) !== computedTotalOutstanding) {
                varianceList.push(`Total Outstanding (Sheet: ₦${parseFloat(logStatus.totalOutstanding).toLocaleString()} vs Input: ₦${computedTotalOutstanding.toLocaleString()})`);
            }
            if (parseFloat(logStatus.nextDayCollection) !== computedNextDayCollection) {
                varianceList.push(`Next Day Collection (Sheet: ₦${parseFloat(logStatus.nextDayCollection).toLocaleString()} vs Input: ₦${computedNextDayCollection.toLocaleString()})`);
            }
            
            if (varianceList.length > 0 && warningFlag) {
                if (isOverrideTicked) {
                    console.log("Authorized Overwrite: Bypassing validation wall to update ledger record.");
                    warningFlag.style.display = "none";
                    if (overwriteCheckbox) overwriteCheckbox.checked = false;
                } else {
                    const detailsContainer = document.getElementById('warning-details');
                    if (detailsContainer) {
                        detailsContainer.innerHTML = `An existing entry for <strong>${extractedMarketName}</strong> on 
                        <strong>${extractedReportDate}</strong> was detected. 
                        The values you are currently submitting do not match the documented ledger record:<br><ul><li>` + 
                        varianceList.join("</li><li>") + `</li></ul>Please re-verify raw inputs or check the override box below 
                        if the original sheet record was incorrect.`;
                    }
                    warningFlag.style.display = "block";
                    warningFlag.scrollIntoView({ behavior: 'smooth' });
                    return; 
                }
            }
        }
    } catch (auditError) {
        console.error("Ledger compliance verification exception:", auditError);
    }

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

    fetch(GOOGLE_SHEETS_API_ENDPOINT, {
        method: "POST",
        mode: "no-cors", 
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(spreadsheetDataPayload)
    })
    .then(() => alert(`✅ Financial data ledger safely synced for ${extractedMarketName} on ${extractedReportDate}!`))
    .catch(err => console.error("Data transmission exception:", err));
}

// Next Day Collection Calc
function runNextDayCalc() {
    const cell1 = parseFloat(document.getElementById('supposeColl2').value) || 0;
    const cell2 = parseFloat(document.getElementById('calcCell2').value) || 0;
    const cell3 = parseFloat(document.getElementById('calcCell3').value) || 0; 
    const cell4 = parseFloat(document.getElementById('payOff2').value) || 0;
    const sumtotal = cell1 - (cell2 + cell4) + cell3;
    document.getElementById('nextDayCollection').innerText = "₦" + sumtotal.toLocaleString();
}

// Outstanding Calc
function runOutstandingCalc() {
    const outcell0 = parseFloat(document.getElementById('previousoutstanding').value) || 0;
    const outCell3 = parseFloat(document.getElementById('defaultAmt2').value) || 0;
    const outCell4 = parseFloat(document.getElementById('recovery2').value) || 0;
    const sumtotal = outcell0 + outCell3 - outCell4;
    document.getElementById('outstandingResult').innerText = "₦" + sumtotal.toLocaleString();
}

// Event Listeners
document.getElementById('autoFillBtn').addEventListener('click', extractData);
document.getElementById('calculateBtn').addEventListener('click', runCalculation);
document.getElementById('calcNextDayBtn').addEventListener('click', runNextDayCalc);
document.getElementById('calcOutstandingBtn').addEventListener('click', runOutstandingCalc);
