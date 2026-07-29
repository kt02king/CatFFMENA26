const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, 'config.json');
const historyPath = path.join(__dirname, 'history.json');

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
let history = [];
if (fs.existsSync(historyPath)) {
    history = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
}

const { target_settings, special_target_settings, performance, fuzzing_rules, custom_targets, modules_toggles, notifications } = config;

const activeCDN = process.env.BEST_CDN || 'cdn';

const baseUrl = `https://dl.${activeCDN}.freefiremobile.com/common/${target_settings.version_code}/ME/${target_settings.date}/`;
const gmcUrl = `https://dl.${activeCDN}.freefiremobile.com/common/${target_settings.version_code}/ME/${target_settings.date}/`;
const specialUrl = `https://dl.${activeCDN}.freefiremobile.com/common/${special_target_settings.splash_anno_version}/ME/${special_target_settings.splash_anno_date}/`;

const chars = [];
if (fuzzing_rules.use_uppercase_letters) {
    for (let i = 65; i <= 90; i++) chars.push(String.fromCharCode(i));
}
if (fuzzing_rules.use_numbers_in_x) {
    for (let i = 48; i <= 57; i++) chars.push(String.fromCharCode(i));
}

const xCombs = [];
const generateX = (prefix, length) => {
    if (length === 0) {
        xCombs.push(prefix);
        return;
    }
    for (const c of chars) {
        generateX(prefix + c, length - 1);
    }
};

for (let i = 1; i <= fuzzing_rules.max_x_length; i++) {
    generateX("", i);
}

const nums = [];
for (let i = 1; i <= fuzzing_rules.number_suffix_max; i++) {
    nums.push(i.toString());
    if (i < 10) nums.push("0" + i);
}

const urls = new Set();
const addUrl = (u) => {
    if (!history.includes(u)) {
        urls.add(u);
    }
};

target_settings.languages.forEach(lang => {
    if (modules_toggles.O) xCombs.forEach(x => addUrl(`${baseUrl}O${x}_${lang}.png`));
    if (modules_toggles.O_Craftland) xCombs.forEach(x => addUrl(`${baseUrl}OC${x}_${lang}.png`));
    if (modules_toggles.OP_PNG) xCombs.forEach(x => addUrl(`${baseUrl}OP${x}_${lang}.png`));
    if (modules_toggles.OP_JPG) xCombs.forEach(x => addUrl(`${baseUrl}OP${x}_${lang}.jpg`));
    if (modules_toggles.LB) xCombs.forEach(x => addUrl(`${baseUrl}LB${x}_${lang}.png`));
    if (modules_toggles.ST) xCombs.forEach(x => addUrl(`${baseUrl}ST${x}${lang}.png`));
    if (modules_toggles.ST_Craftland) xCombs.forEach(x => addUrl(`${baseUrl}STC${x}${lang}.png`));
    if (modules_toggles.SM) xCombs.forEach(x => addUrl(`${baseUrl}SM${x}_${lang}.png`));
    if (modules_toggles.BG) xCombs.forEach(x => addUrl(`${baseUrl}BG${x}_${lang}.png`));
    if (modules_toggles.TT_1) xCombs.forEach(x => addUrl(`${baseUrl}TT${x}_${lang}.png`));
    if (modules_toggles.TT_2) xCombs.forEach(x => addUrl(`${baseUrl}TT${x}${lang}.png`));

    if (modules_toggles.BT_1) {
        xCombs.forEach(x => {
            nums.forEach(n => addUrl(`${baseUrl}BT${x}${n}${lang}.png`));
        });
    }
    
    if (modules_toggles.BT_2) {
        nums.forEach(n => addUrl(`${baseUrl}BTAnchor${n}${lang}.png`));
    }
    
    if (modules_toggles.BT_Craftland) {
        nums.forEach(n => addUrl(`${gmcUrl}BTCAnchorC${n}${lang}.png`));
    }

    if (modules_toggles.Splash) {
        for (let i = fuzzing_rules.splash_start_number; i <= fuzzing_rules.splash_end_number; i++) {
            addUrl(`${specialUrl}Splash${i}_${lang}.png`);
        }
    }
    
    if (modules_toggles.Anno) {
        for (let i = fuzzing_rules.anno_start_number; i <= fuzzing_rules.anno_end_number; i++) {
            addUrl(`${specialUrl}Anno${i}_${lang}.png`);
        }
    }

    if (modules_toggles.TopUp) {
        nums.forEach(n => {
            addUrl(`${baseUrl}BGTopB${n}_${lang}.png`);
            addUrl(`${baseUrl}TTTopB${n}${lang}.png`);
            addUrl(`${baseUrl}BGTopB${n}icon_${lang}.png`);
        });
    }

    if (modules_toggles.BP_Title) {
        custom_targets.booyah_pass_numbers.forEach(n => {
            addUrl(`${baseUrl}BPS${n}Title_${lang}.png`);
        });
    }

    custom_targets.specific_event_names.forEach(evt => {
        nums.forEach(n => {
            addUrl(`${baseUrl}BG${evt}${n}_${lang}.png`);
            addUrl(`${baseUrl}TT${evt}${n}${lang}.png`);
        });
    });
});

const urlArray = Array.from(urls);
let currentIndex = 0;
const newLinks = [];
const stats = {
    totalScanned: urlArray.length,
    found: 0,
    failed: 0
};

const fetchWithTimeout = async (url) => {
    for (let i = 0; i <= performance.max_retries; i++) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), performance.timeout_ms);
            
            const response = await fetch(url, {
                method: 'HEAD',
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (response.status === 200) return true;
            if (response.status === 404) return false;
        } catch (error) {
            if (i === performance.max_retries) return false;
        }
    }
    return false;
};

const worker = async () => {
    while (currentIndex < urlArray.length) {
        const url = urlArray[currentIndex++];
        const isFound = await fetchWithTimeout(url);
        
        if (isFound) {
            newLinks.push(url);
            history.push(url);
            stats.found++;
            console.log(`[FOUND] ${url}`);
        } else {
            stats.failed++;
        }
    }
};

const sendTelegramNotification = async (links) => {
    const token = process.env.TELEGRAM_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    
    if (!token || !chatId) {
        return;
    }

    let message = `🔍 New Images Found (${target_settings.version_code}):\n\n`;
    for (const link of links) {
        if ((message.length + link.length + 5) > 4000) {
            await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chatId, text: message, disable_web_page_preview: true })
            });
            message = "";
        }
        message += `${link}\n\n`;
    }

    if (message.trim().length > 0) {
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: message, disable_web_page_preview: true })
        });
    }
};

const start = async () => {
    console.log(`\nActive CDN: dl.${activeCDN}.freefiremobile.com`);
    console.log(`Generated Unique URLs to check: ${urlArray.length}`);
    
    const workers = [];
    for (let i = 0; i < performance.concurrency_limit; i++) {
        workers.push(worker());
    }

    await Promise.all(workers);

    fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));

    if (notifications.enable_telegram && newLinks.length > 0) {
        await sendTelegramNotification(newLinks);
    }

    console.log('\n====================================');
    console.log('         SCAN SUMMARY               ');
    console.log('====================================');
    console.log(`Total URLs Checked : ${stats.totalScanned}`);
    console.log(`New Images Found   : ${stats.found}`);
    console.log(`Failed / Not Found : ${stats.failed}`);
    console.log(`History File Size  : ${history.length} links`);
    console.log('====================================\n');
};

start();
