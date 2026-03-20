/**
 * Popup Script
 * Handles UI interactions and displays trading data
 */

// Rule definitions for display
const RULES_DATA = {
  instant_funding: {
    name: 'Instant Funding',
    description: 'Start trading immediately with a funded account',
    rules: {
      'Profit Target': 'None (Unlimited)',
      'Daily Loss Limit': '3% of daily start balance',
      'Max Total Loss': '6% of initial balance',
      'Consistency Rule': 'No single day > 15% of total profits',
      'Min Trading Days': '7 days before first payout',
      'Leverage (Forex)': '1:30',
      'Leverage (Commodities)': '1:10',
      'Leverage (Crypto)': '1:1',
      'Profit Split': '80%'
    }
  },
  one_step: {
    name: 'One-Step Evaluation',
    description: 'Pass one evaluation phase to get funded',
    stages: {
      evaluation: {
        'Profit Target': '10%',
        'Daily Loss Limit': '3%',
        'Max Total Loss': '6%',
        'Min Trading Days': '3 days',
        'Time Limit': 'Unlimited'
      },
      funded: {
        'Profit Target': 'None (Unlimited)',
        'Daily Loss Limit': '3%',
        'Max Total Loss': '6%',
        'Min Trading Days': 'None for payouts'
      }
    },
    common: {
      'Leverage (Forex)': '1:30',
      'Leverage (Commodities)': '1:10',
      'Leverage (Crypto)': '1:1',
      'Profit Split': '80%'
    }
  },
  two_step: {
    name: 'Two-Step Evaluation',
    description: 'Complete two evaluation stages to get funded',
    stages: {
      stage1: {
        'Profit Target': '8%',
        'Daily Loss Limit': '5%',
        'Max Total Loss': '10%',
        'Min Trading Days': '5 days',
        'Time Limit': 'Unlimited'
      },
      stage2: {
        'Profit Target': '5%',
        'Daily Loss Limit': '5%',
        'Max Total Loss': '10%',
        'Min Trading Days': '5 days',
        'Time Limit': 'Unlimited'
      },
      funded: {
        'Profit Target': 'None (Unlimited)',
        'Daily Loss Limit': '5%',
        'Max Total Loss': '10%',
        'Max Risk Per Trade': '< 3%',
        'Min Trading Days': 'None for payouts'
      }
    },
    common: {
      'Leverage (Forex)': '1:100',
      'Leverage (Commodities)': '1:30',
      'Leverage (Crypto)': '1:2',
      'Profit Split': '80%'
    }
  }
};

// DOM Elements
const elements = {
  // Platform status
  platformStatus: document.getElementById('platform-status'),
  refreshConnectionBtn: document.getElementById('refresh-connection'),
  
  // Setup section
  setupSection: document.getElementById('setup-section'),
  accountTypeSelect: document.getElementById('account-type'),
  accountSizeSelect: document.getElementById('account-size'),
  stageGroup: document.getElementById('stage-group'),
  currentStageSelect: document.getElementById('current-stage'),
  saveAccountBtn: document.getElementById('save-account'),
  
  // Account info
  accountInfo: document.getElementById('account-info'),
  displayAccountType: document.getElementById('display-account-type'),
  displayAccountSize: document.getElementById('display-account-size'),
  displayStageContainer: document.getElementById('display-stage-container'),
  displayStage: document.getElementById('display-stage'),
  editAccountBtn: document.getElementById('edit-account'),
  
  // Dashboard
  dashboard: document.getElementById('dashboard'),
  currentEquity: document.getElementById('current-equity'),
  equityChange: document.getElementById('equity-change'),
  
  // Progress bars
  dailyLossLimit: document.getElementById('daily-loss-limit'),
  dailyLossCurrent: document.getElementById('daily-loss-current'),
  dailyLossMax: document.getElementById('daily-loss-max'),
  dailyLossProgress: document.getElementById('daily-loss-progress'),
  
  totalLossLimit: document.getElementById('total-loss-limit'),
  totalLossCurrent: document.getElementById('total-loss-current'),
  totalLossMax: document.getElementById('total-loss-max'),
  totalLossProgress: document.getElementById('total-loss-progress'),
  
  profitTargetCard: document.getElementById('profit-target-card'),
  profitTargetLimit: document.getElementById('profit-target-limit'),
  profitTargetCurrent: document.getElementById('profit-target-current'),
  profitTargetMax: document.getElementById('profit-target-max'),
  profitTargetProgress: document.getElementById('profit-target-progress'),
  
  // Daily Target (Funded accounts)
  dailyTargetCard: document.getElementById('daily-target-card'),
  dailyTargetLimit: document.getElementById('daily-target-limit'),
  dailyTargetCurrent: document.getElementById('daily-target-current'),
  dailyTargetMax: document.getElementById('daily-target-max'),
  dailyTargetProgress: document.getElementById('daily-target-progress'),
  dailyTargetSetting: document.getElementById('daily-target-setting'),
  dailyTargetPct: document.getElementById('daily-target-pct'),
  dailyTargetUsd: document.getElementById('daily-target-usd'),
  saveDailyTargetBtn: document.getElementById('save-daily-target'),
  resetDailyTargetBtn: document.getElementById('reset-daily-target'),
  
  // Toxicity
  toxicityCard: document.getElementById('toxicity-card'),
  toxicityLevel: document.getElementById('toxicity-level'),
  toxicityProgress: document.getElementById('toxicity-progress'),
  toxicityPercentage: document.getElementById('toxicity-percentage'),
  toxicityTrades: document.getElementById('toxicity-trades'),
  toxicityProfitAmount: document.getElementById('toxicity-profit-amount'),
  toxicitySuggestions: document.getElementById('toxicity-suggestions'),
  recheckToxicityBtn: document.getElementById('recheck-toxicity'),
  
  // Violations
  violationsSection: document.getElementById('violations-section'),
  violationsList: document.getElementById('violations-list'),
  
  // Rules accordion
  rulesAccordion: document.getElementById('rules-accordion'),
  
  // Settings
  enableExtension: document.getElementById('enable-extension'),
  showNotifications: document.getElementById('show-notifications'),
  warningThreshold: document.getElementById('warning-threshold'),
  thresholdValue: document.getElementById('threshold-value'),
  resetDataBtn: document.getElementById('reset-data'),
  
  // Status
  statusBadge: document.getElementById('status-badge'),
  goToTfrSection: document.getElementById('go-to-tfr-section'),
  goToTfrBtn: document.getElementById('go-to-tfr'),
  mainContent: document.getElementById('main-content')
};

// State
let currentSettings = {};
let currentState = {};

// Initialize
async function initialize() {
  await loadSettings();
  await loadState();
  setupEventListeners();
  updateUI();
  
  // Listen for updates from background
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'TRADING_STATE_UPDATE') {
      currentState = message.state;
      updateUI(); // Full UI update to catch auto-detected account type
    } else if (message.type === 'NEW_VIOLATION') {
      addViolation(message.violation);
    } else if (message.type === 'PLATFORM_STATUS') {
      updatePlatformStatus(message.isOnPlatform);
    }
  });
}

// Load settings from storage
async function loadSettings() {
  const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
  currentSettings = response.settings || {};
  
  // Apply settings to UI
  elements.enableExtension.checked = currentSettings.enabled !== false;
  elements.showNotifications.checked = currentSettings.showNotifications !== false;
  elements.warningThreshold.value = currentSettings.warningThreshold || 80;
  elements.thresholdValue.textContent = (currentSettings.warningThreshold || 80) + '%';
  
  // Load daily target
  if (currentSettings.dailyTargetPct) {
    elements.dailyTargetPct.value = currentSettings.dailyTargetPct;
  }
  if (currentSettings.dailyTargetUsd) {
    elements.dailyTargetUsd.value = currentSettings.dailyTargetUsd;
  }
  
  // Set account selects if configured
  if (currentSettings.accountType) {
    elements.accountTypeSelect.value = currentSettings.accountType;
    elements.accountSizeSelect.value = currentSettings.accountSize || '';
    elements.currentStageSelect.value = currentSettings.currentStage || '';
  }
}

// Load state from storage
async function loadState() {
  const response = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
  currentState = response.state || {};
  console.log('TFR Popup: Loaded state - accountType:', currentState.accountType, 'accountSize:', currentState.accountSize, 'stage:', currentState.currentStage);
}

// Setup event listeners
function setupEventListeners() {
  // Account type change - show/hide stage selector
  elements.accountTypeSelect.addEventListener('change', () => {
    const needsStage = elements.accountTypeSelect.value !== 'instant_funding';
    elements.stageGroup.style.display = needsStage ? 'block' : 'none';
  });
  
  // Save account settings
  elements.saveAccountBtn.addEventListener('click', saveAccountSettings);
  
  // Edit account
  elements.editAccountBtn.addEventListener('click', () => {
    elements.accountInfo.style.display = 'none';
    elements.setupSection.style.display = 'block';
  });
  
  // Settings toggles
  elements.enableExtension.addEventListener('change', () => {
    updateSettings({ enabled: elements.enableExtension.checked });
  });
  
  elements.showNotifications.addEventListener('change', () => {
    updateSettings({ showNotifications: elements.showNotifications.checked });
  });
  
  elements.warningThreshold.addEventListener('input', () => {
    const value = elements.warningThreshold.value;
    elements.thresholdValue.textContent = value + '%';
    updateSettings({ warningThreshold: parseInt(value) });
  });
  
  // Daily target: sync % <-> $ and auto-save
  elements.dailyTargetPct.addEventListener('input', () => {
    const accountSize = currentSettings.accountSize || currentState.accountSize || 0;
    const pct = parseFloat(elements.dailyTargetPct.value) || 0;
    if (pct && accountSize) {
      elements.dailyTargetUsd.value = (pct / 100 * accountSize).toFixed(0);
    }
    saveDailyTarget();
  });
  
  elements.dailyTargetUsd.addEventListener('input', () => {
    const accountSize = currentSettings.accountSize || currentState.accountSize || 0;
    const usd = parseFloat(elements.dailyTargetUsd.value) || 0;
    if (usd && accountSize) {
      elements.dailyTargetPct.value = (usd / accountSize * 100).toFixed(2);
    }
    saveDailyTarget();
  });
  
  // Reset data
  elements.resetDataBtn.addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ type: 'RESET_DAILY' });
    elements.violationsSection.style.display = 'none';
    elements.violationsList.innerHTML = '';
  });
  
  // Go to TheFundedRoom button
  elements.goToTfrBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://thefundedroom.com/' });
  });
  
  // Save daily target button
  elements.saveDailyTargetBtn.addEventListener('click', () => {
    saveDailyTarget();
    // Visual feedback
    const btn = elements.saveDailyTargetBtn;
    const orig = btn.innerHTML;
    btn.innerHTML = '&#10003; Saved!';
    btn.style.background = '#00c97d';
    setTimeout(() => { btn.innerHTML = orig; btn.style.background = '#6c3fc5'; }, 1500);
  });
  
  // Reset daily target to default (clear)
  elements.resetDailyTargetBtn.addEventListener('click', () => {
    elements.dailyTargetPct.value = '';
    elements.dailyTargetUsd.value = '';
    updateSettings({ dailyTargetPct: null, dailyTargetUsd: null });
    updateDailyTargetCard();
    // Visual feedback
    const btn = elements.resetDailyTargetBtn;
    btn.textContent = 'Cleared';
    setTimeout(() => { btn.innerHTML = '&#8635; Reset'; }, 1500);
  });
  
  // Recheck toxicity button
  elements.recheckToxicityBtn.addEventListener('click', () => {
    updateToxicityCard(true); // Force animation on manual recheck
    // Visual feedback
    const btn = elements.recheckToxicityBtn;
    const orig = btn.innerHTML;
    btn.innerHTML = '&#10003; Updated';
    btn.style.background = 'rgba(0,201,125,0.2)';
    btn.style.color = '#00c97d';
    setTimeout(() => { 
      btn.innerHTML = orig; 
      btn.style.background = 'rgba(108,63,197,0.2)'; 
      btn.style.color = '#a78bfa';
    }, 2000);
  });
  
  // Refresh connection button
  elements.refreshConnectionBtn.addEventListener('click', async () => {
    const btn = elements.refreshConnectionBtn;
    const origText = btn.innerHTML;
    btn.innerHTML = '&#128260; Refreshing...';
    btn.disabled = true;
    btn.style.opacity = '0.6';
    
    // Query current tab to check if on TheFundedRoom
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const isOnPlatform = tab && tab.url && tab.url.includes('thefundedroom.com');
      
      if (isOnPlatform) {
        // Send message to content script to refresh data
        chrome.tabs.sendMessage(tab.id, { action: 'refreshData' }, (response) => {
          if (chrome.runtime.lastError) {
            console.log('TFR Guardian: Content script not ready, reloading page...');
            // Content script not loaded - reload the tab to inject it
            chrome.tabs.reload(tab.id, {}, () => {
              setTimeout(() => {
                chrome.tabs.sendMessage(tab.id, { action: 'refreshData' });
              }, 1500);
            });
          }
        });
        
        // Wait a moment then reload popup data
        setTimeout(async () => {
          await loadStoredData();
          updateUI();
          btn.innerHTML = '&#10003; Refreshed';
          btn.style.background = 'rgba(0,201,125,0.2)';
          btn.style.color = '#00c97d';
          
          setTimeout(() => {
            btn.innerHTML = origText;
            btn.style.background = 'rgba(108,63,197,0.2)';
            btn.style.color = '#a78bfa';
            btn.disabled = false;
            btn.style.opacity = '1';
          }, 1500);
        }, 1000);
      } else {
        // Not on platform - just reload data from storage
        await loadStoredData();
        updateUI();
        btn.innerHTML = '&#10003; Updated';
        btn.style.background = 'rgba(0,201,125,0.2)';
        btn.style.color = '#00c97d';
        
        setTimeout(() => {
          btn.innerHTML = origText;
          btn.style.background = 'rgba(108,63,197,0.2)';
          btn.style.color = '#a78bfa';
          btn.disabled = false;
          btn.style.opacity = '1';
        }, 1500);
      }
    } catch (error) {
      console.error('TFR Guardian: Refresh error:', error);
      btn.innerHTML = '&#10060; Error';
      btn.style.background = 'rgba(224,90,90,0.2)';
      btn.style.color = '#e05a5a';
      
      setTimeout(() => {
        btn.innerHTML = origText;
        btn.style.background = 'rgba(108,63,197,0.2)';
        btn.style.color = '#a78bfa';
        btn.disabled = false;
        btn.style.opacity = '1';
      }, 2000);
    }
  });
}

// Save account settings
async function saveAccountSettings() {
  const accountType = elements.accountTypeSelect.value;
  const accountSize = elements.accountSizeSelect.value;
  const currentStage = elements.currentStageSelect.value;
  
  if (!accountType || !accountSize) {
    alert('Please select both account type and size');
    return;
  }
  
  if (accountType !== 'instant_funding' && !currentStage) {
    alert('Please select your current stage');
    return;
  }
  
  await updateSettings({
    accountType,
    accountSize: parseInt(accountSize),
    currentStage: accountType === 'instant_funding' ? null : currentStage
  });
  
  updateUI();
}

// Update settings
async function updateSettings(newSettings) {
  await chrome.runtime.sendMessage({
    type: 'UPDATE_SETTINGS',
    settings: newSettings
  });
  Object.assign(currentSettings, newSettings);
}

// Update UI based on current state
function updateUI() {
  // Check for auto-detected account data from API
  const hasAutoDetectedData = currentState.accountType && currentState.accountSize;
  const hasManualSettings = currentSettings.accountType && currentSettings.accountSize;
  const hasAccount = hasManualSettings || hasAutoDetectedData;
  
  // Use auto-detected data if available, otherwise use manual settings
  const effectiveAccountType = currentSettings.accountType || currentState.accountType;
  const effectiveAccountSize = currentSettings.accountSize || currentState.accountSize;
  const effectiveStage = currentSettings.currentStage || currentState.currentStage;
  
  if (hasAccount) {
    elements.setupSection.style.display = 'none';
    elements.accountInfo.style.display = 'block';
    elements.dashboard.style.display = 'block';
    
    // Update account display
    const accountData = RULES_DATA[effectiveAccountType];
    elements.displayAccountType.textContent = accountData ? accountData.name : (effectiveAccountType || 'Unknown');
    elements.displayAccountSize.textContent = '$' + parseInt(effectiveAccountSize).toLocaleString();
    
    // Show auto-detected badge if using API data
    if (hasAutoDetectedData && !hasManualSettings) {
      elements.displayAccountType.innerHTML += ' <span style="font-size: 10px; color: #4caf50;">(Auto)</span>';
    }
    
    if (effectiveStage) {
      elements.displayStageContainer.style.display = 'flex';
      elements.displayStage.textContent = formatStage(effectiveStage);
    } else {
      elements.displayStageContainer.style.display = 'none';
    }
    
    // Update rules accordion
    updateRulesAccordion();
    
    // Update dashboard limits
    updateDashboardLimits();
    
    // Show/hide daily target setting based on stage
    updateDailyTargetCard();
  } else {
    elements.setupSection.style.display = 'block';
    elements.accountInfo.style.display = 'none';
    elements.dashboard.style.display = 'none';
  }
  
  // Update platform status
  updatePlatformStatus(currentState.isOnPlatform);
  
  // Update dashboard if we have data
  updateDashboard();
  
  // Update trading activity
  updateTradingActivity();
}

// Format stage name
function formatStage(stage) {
  const names = {
    evaluation: 'Evaluation / Stage 1',
    stage2: 'Stage 2',
    funded: 'Funded Account'
  };
  return names[stage] || stage;
}

// Update platform status display
function updatePlatformStatus(isOnPlatform) {
  if (isOnPlatform) {
    elements.platformStatus.classList.add('connected');
    elements.platformStatus.querySelector('.status-title').textContent = 'Connected to TheFundedRoom';
    elements.platformStatus.querySelector('.status-subtitle').textContent = 'Monitoring your trading activity';
    elements.mainContent.style.display = 'block';
    elements.goToTfrSection.style.display = 'none';
  } else {
    elements.platformStatus.classList.remove('connected');
    elements.platformStatus.querySelector('.status-title').textContent = 'Not on TheFundedRoom';
    elements.platformStatus.querySelector('.status-subtitle').textContent = 'Navigate to thefundedroom.com to activate monitoring';
    elements.mainContent.style.display = 'none';
    elements.goToTfrSection.style.display = 'block';
  }
}

// Update dashboard limits based on account type
function updateDashboardLimits() {
  const rules = getCurrentRules();
  if (!rules) return;
  
  elements.dailyLossLimit.textContent = (rules.dailyLossLimit * 100).toFixed(0) + '%';
  elements.dailyLossMax.textContent = (rules.dailyLossLimit * 100).toFixed(0) + '%';
  
  elements.totalLossLimit.textContent = (rules.maxTotalLoss * 100).toFixed(0) + '%';
  elements.totalLossMax.textContent = (rules.maxTotalLoss * 100).toFixed(0) + '%';
  
  if (rules.profitTarget) {
    elements.profitTargetCard.style.display = 'block';
    elements.profitTargetLimit.textContent = (rules.profitTarget * 100).toFixed(0) + '%';
    elements.profitTargetMax.textContent = (rules.profitTarget * 100).toFixed(0) + '%';
  } else {
    elements.profitTargetCard.style.display = 'none';
  }
}

// Get current rules based on account type and stage
function getCurrentRules() {
  // Use auto-detected or manual settings
  const type = currentSettings.accountType || currentState.accountType;
  const stage = currentSettings.currentStage || currentState.currentStage;
  
  // If we have API challenge rules, use them directly (most accurate)
  if (currentState.challengeRules) {
    const cr = currentState.challengeRules;
    const dailyLossLimit = (cr.maxDailyLoss || 5) / 100;
    const maxTotalLoss = (cr.maxTotalLoss || 10) / 100;
    let profitTarget = null;
    // Determine profit target based on stage
    if (stage === 'stage2' || stage === 'step2') {
      profitTarget = cr.step2ProfitTarget ? cr.step2ProfitTarget / 100 : null;
    } else if (stage === 'evaluation' || stage === 'stage1' || stage === 'step1') {
      profitTarget = cr.step1ProfitTarget ? cr.step1ProfitTarget / 100 : null;
    }
    // funded stage has no profit target
    return { dailyLossLimit, maxTotalLoss, profitTarget };
  }
  
  if (!type) return null;
  
  const rulesData = RULES_DATA[type];
  
  if (type === 'instant_funding') {
    return {
      dailyLossLimit: 0.03,
      maxTotalLoss: 0.06,
      consistencyCap: 0.15,
      profitTarget: null
    };
  }
  
  if (rulesData && rulesData.stages && stage && rulesData.stages[stage]) {
    const stageRules = rulesData.stages[stage];
    return {
      dailyLossLimit: parseFloat(stageRules['Daily Loss Limit']) / 100 || 0.05,
      maxTotalLoss: parseFloat(stageRules['Max Total Loss']) / 100 || 0.10,
      profitTarget: stageRules['Profit Target'] !== 'None (Unlimited)' ? 
        parseFloat(stageRules['Profit Target']) / 100 : null
    };
  }
  
  // Default fallback
  return { dailyLossLimit: 0.05, maxTotalLoss: 0.10, profitTarget: null };
}

// Update dashboard with current trading data
function updateDashboard() {
  // Use auto-detected or manual account size
  const effectiveAccountSize = currentSettings.accountSize || currentState.accountSize;
  if (!currentState.currentEquity || !effectiveAccountSize) return;
  
  const equity = currentState.currentEquity;
  const accountSize = effectiveAccountSize;
  const dailyStart = currentState.dailyStartBalance || accountSize;
  const dailyHigh = currentState.dailyHighBalance || dailyStart;
  
  // Update equity display
  elements.currentEquity.textContent = '$' + equity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  
  const change = equity - accountSize;
  const changePct = (change / accountSize) * 100;
  elements.equityChange.textContent = (change >= 0 ? '+' : '') + change.toFixed(2) + ' (' + (changePct >= 0 ? '+' : '') + changePct.toFixed(2) + '%)';
  elements.equityChange.className = 'equity-change ' + (change >= 0 ? 'positive' : 'negative');
  
  // Update progress bars
  const rules = getCurrentRules();
  if (rules) {
    // Daily loss (from daily high, not start)
    const dailyLoss = Math.max(0, dailyHigh - equity);
    const dailyLossPct = dailyLoss / dailyHigh;
    updateProgressBar(elements.dailyLossProgress, elements.dailyLossCurrent, dailyLossPct, rules.dailyLossLimit);
    
    // Total loss
    const totalLoss = Math.max(0, accountSize - equity);
    const totalLossPct = totalLoss / accountSize;
    updateProgressBar(elements.totalLossProgress, elements.totalLossCurrent, totalLossPct, rules.maxTotalLoss);
    
    // Profit target
    if (rules.profitTarget) {
      const profit = Math.max(0, equity - accountSize);
      const profitPct = profit / accountSize;
      updateProgressBar(elements.profitTargetProgress, elements.profitTargetCurrent, profitPct, rules.profitTarget, true);
    }
  }
  
  // Daily target card (funded accounts)
  updateDailyTargetCard();
  
  // Toxicity card (always shown)
  updateToxicityCard();
}

// Save daily target to settings
function saveDailyTarget() {
  const pct = parseFloat(elements.dailyTargetPct.value) || null;
  const usd = parseFloat(elements.dailyTargetUsd.value) || null;
  updateSettings({ dailyTargetPct: pct, dailyTargetUsd: usd });
  updateDailyTargetCard();
}

// Update Daily Target card for funded accounts
function updateDailyTargetCard() {
  const effectiveStage = currentSettings.currentStage || currentState.currentStage;
  const isFunded = effectiveStage === 'funded';
  
  // Show/hide daily target setting in settings section
  if (elements.dailyTargetSetting) {
    elements.dailyTargetSetting.style.display = isFunded ? 'block' : 'none';
  }
  
  const pct = parseFloat(currentSettings.dailyTargetPct) || 0;
  const usd = parseFloat(currentSettings.dailyTargetUsd) || 0;
  
  if (!isFunded || (!pct && !usd)) {
    elements.dailyTargetCard.style.display = 'none';
    return;
  }
  
  const accountSize = currentSettings.accountSize || currentState.accountSize || 0;
  const equity = currentState.currentEquity || 0;
  const dailyStart = currentState.dailyStartBalance || accountSize;
  
  // Calculate today's PnL from closed trades (not total equity change)
  const todayStr = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local time
  const trades = currentState.tradeHistory || [];
  
  console.log('TFR Popup: Daily target calc - trades count:', trades.length, 'today:', todayStr);
  if (trades.length > 0) {
    console.log('TFR Popup: First trade closeTime:', trades[0].closeTime, 'pnl:', trades[0].pnl);
  }
  
  const todayPnl = trades
    .filter(t => {
      if (!t.closeTime || t.pnl == null) return false;
      // Handle various date formats
      let closeDate;
      try {
        const timeStr = String(t.closeTime);
        if (timeStr.includes('T') || timeStr.includes('Z')) {
          closeDate = new Date(timeStr);
        } else {
          // Assume it's a timestamp or local date string
          closeDate = new Date(timeStr);
        }
        if (isNaN(closeDate.getTime())) return false;
      } catch (e) {
        return false;
      }
      const tradeDateStr = closeDate.toLocaleDateString('en-CA');
      return tradeDateStr === todayStr;
    })
    .reduce((sum, t) => sum + (parseFloat(t.pnl) || 0), 0);
  
  const dailyProfit = Math.max(0, todayPnl);
  
  // Determine target in $
  let targetUsd = usd;
  if (!targetUsd && pct && accountSize) {
    targetUsd = pct / 100 * accountSize;
  }
  
  if (!targetUsd) {
    elements.dailyTargetCard.style.display = 'none';
    return;
  }
  
  const targetPct = pct || (targetUsd / accountSize * 100);
  const progressPct = Math.min((dailyProfit / targetUsd) * 100, 100);
  const reached = dailyProfit >= targetUsd;
  
  elements.dailyTargetCard.style.display = 'block';
  elements.dailyTargetLimit.textContent = targetPct.toFixed(1) + '%';
  elements.dailyTargetLimit.style.color = reached ? '#00c97d' : '#a78bfa';
  elements.dailyTargetProgress.style.width = progressPct + '%';
  elements.dailyTargetProgress.className = 'progress-fill ' + (reached ? 'safe' : 'profit');
  elements.dailyTargetCurrent.textContent = '+$' + dailyProfit.toFixed(2);
  elements.dailyTargetCurrent.style.color = reached ? '#00c97d' : '#fff';
  elements.dailyTargetMax.textContent = '$' + targetUsd.toFixed(0);
  
  if (reached) {
    elements.dailyTargetCard.style.border = '1px solid #00c97d44';
    elements.dailyTargetCard.querySelector('.rule-name').textContent = '🎯 Daily Target ✅';
  } else {
    elements.dailyTargetCard.style.border = '';
    elements.dailyTargetCard.querySelector('.rule-name').textContent = '🎯 Daily Target';
  }
}

// Calculate toxicity from trade history
function calculateToxicity() {
  const trades = currentState.tradeHistory || [];
  if (trades.length === 0) {
    return {
      level: 'low',
      subOneMinuteTrades: 0,
      totalTrades: 0,
      subOneMinuteProfit: 0,
      totalProfit: 0,
      tradePercentage: 0,
      profitPercentage: 0
    };
  }

  let subOneMinuteTrades = 0;
  let subOneMinuteProfit = 0;  // Only positive PnL (profits)
  let subOneMinuteLoss = 0;    // Only negative PnL (losses, as positive number)
  let totalProfit = 0;

  trades.forEach(trade => {
    const pnl = parseFloat(trade.pnl) || 0;
    totalProfit += pnl;

    if (trade.openTime && trade.closeTime) {
      try {
        const openDate = new Date(trade.openTime);
        const closeDate = new Date(trade.closeTime);
        const durationMs = closeDate - openDate;
        const durationMinutes = durationMs / (1000 * 60);

        if (durationMinutes < 1) {
          subOneMinuteTrades++;
          if (pnl > 0) {
            subOneMinuteProfit += pnl;
          } else if (pnl < 0) {
            subOneMinuteLoss += Math.abs(pnl);
          }
        }
      } catch (e) {
        // Skip invalid dates
      }
    }
  });

  const totalTrades = trades.length;
  const tradePercentage = (subOneMinuteTrades / totalTrades) * 100;
  const profitPercentage = totalProfit > 0 ? (subOneMinuteProfit / totalProfit) * 100 : 0;

  let level = 'low';
  if (tradePercentage >= 20 || profitPercentage >= 20) {
    level = 'critical';
  } else if (tradePercentage >= 15 || profitPercentage >= 15) {
    level = 'high';
  } else if (tradePercentage >= 10 || profitPercentage >= 10) {
    level = 'medium';
  }

  return {
    level,
    subOneMinuteTrades,
    totalTrades,
    subOneMinuteProfit,
    subOneMinuteLoss,
    totalProfit,
    tradePercentage: parseFloat(tradePercentage.toFixed(2)),
    profitPercentage: parseFloat(profitPercentage.toFixed(2))
  };
}

// Get suggestions for reducing toxicity
function getToxicitySuggestions(toxicity) {
  const suggestions = [];
  
  if (toxicity.level === 'low') {
    return ['Your trading pattern looks healthy. Keep holding trades for at least 1 minute to maintain this.'];
  }

  if (toxicity.tradePercentage >= 10) {
    const tradesNeeded = Math.ceil((toxicity.subOneMinuteTrades * 10 - toxicity.totalTrades) / 9);
    if (tradesNeeded > 0) {
      suggestions.push(`Place ${tradesNeeded} more trade${tradesNeeded > 1 ? 's' : ''} held for 1+ minutes to bring sub-1-min percentage below 10%`);
    }
  }

  if (toxicity.profitPercentage >= 10 && toxicity.totalProfit > 0) {
    const targetProfit = Math.ceil(toxicity.subOneMinuteProfit * 10);
    const additionalProfitNeeded = targetProfit - toxicity.totalProfit;
    if (additionalProfitNeeded > 0) {
      suggestions.push(`Generate $${additionalProfitNeeded.toFixed(0)} more in profits from 1+ minute trades to reduce profit toxicity`);
    }
  }

  suggestions.push('Hold trades for at least 1 minute before closing to avoid toxic trading flags');
  suggestions.push('Use limit orders instead of market orders to reduce impulse trading');
  
  if (toxicity.level === 'critical') {
    suggestions.push('URGENT: You cannot request payout until toxicity drops below 10%');
  }

  return suggestions;
}

// Animate number counting from start to end
function animateCountUp(start, end, duration, callback) {
  const startTime = performance.now();
  
  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    
    // Easing function for smooth animation
    const easeOutQuart = 1 - Math.pow(1 - progress, 4);
    const current = start + (end - start) * easeOutQuart;
    
    callback(current);
    
    if (progress < 1) {
      requestAnimationFrame(update);
    }
  }
  
  requestAnimationFrame(update);
}

// Typewriter effect for text
function typewriterEffect(element, text, speed = 30, callback) {
  element.textContent = '';
  element.style.opacity = '1';
  let i = 0;
  
  function type() {
    if (i < text.length) {
      element.textContent += text.charAt(i);
      i++;
      setTimeout(type, speed);
    } else if (callback) {
      callback();
    }
  }
  
  type();
}

// Toxicity card update state
let toxicityUpdateInProgress = false;
let toxicityUpdateTimeout = null;
let toxicityFirstLoad = true;

// Update toxicity card with animations
function updateToxicityCard(animate = null) {
  // Determine if we should animate - only on first load or explicit request
  const shouldAnimate = animate === true || (animate === null && toxicityFirstLoad);
  
  // Prevent concurrent updates (unless forcing animation)
  if (toxicityUpdateInProgress && !shouldAnimate) {
    // Just update values without animation
    const toxicity = calculateToxicity();
    elements.toxicityLevel.textContent = toxicity.level.charAt(0).toUpperCase() + toxicity.level.slice(1);
    const maxPercentage = Math.max(toxicity.tradePercentage, toxicity.profitPercentage);
    elements.toxicityPercentage.textContent = maxPercentage.toFixed(1) + '%';
    elements.toxicityTrades.textContent = `${toxicity.subOneMinuteTrades}/${toxicity.totalTrades} trades`;
    const profitAtRisk = Math.max(0, toxicity.subOneMinuteProfit);
    elements.toxicityProfitAmount.textContent = profitAtRisk > 0 
      ? '$' + profitAtRisk.toFixed(2) + ' profit at risk (not paid out)'
      : 'No profit at risk from sub-1-min trades';
    return;
  }
  
  if (toxicityUpdateInProgress) {
    if (toxicityUpdateTimeout) clearTimeout(toxicityUpdateTimeout);
    toxicityUpdateTimeout = setTimeout(() => {
      toxicityUpdateInProgress = false;
      updateToxicityCard(animate);
    }, 500);
    return;
  }
  
  toxicityUpdateInProgress = true;
  toxicityFirstLoad = false;
  
  const toxicity = calculateToxicity();
  
  // Always show toxicity card
  elements.toxicityCard.style.display = 'block';
  
  // Update level display
  const levelColors = {
    low: '#00c97d',
    medium: '#f5a623',
    high: '#e05a5a',
    critical: '#ff0000'
  };
  
  // Simple text update (no typewriter to avoid garbling)
  const levelText = toxicity.level.charAt(0).toUpperCase() + toxicity.level.slice(1);
  elements.toxicityLevel.textContent = levelText;
  elements.toxicityLevel.style.color = levelColors[toxicity.level];
  
  // Animate progress bar
  const maxPercentage = Math.max(toxicity.tradePercentage, toxicity.profitPercentage);
  const progressPct = Math.min((maxPercentage / 10) * 100, 100);
  
  if (shouldAnimate) {
    // Start progress bar from 0 and animate to target
    elements.toxicityProgress.style.width = '0%';
    elements.toxicityProgress.style.transition = 'none';
    
    requestAnimationFrame(() => {
      elements.toxicityProgress.style.transition = 'width 0.8s ease-out';
      elements.toxicityProgress.style.width = progressPct + '%';
    });
  } else {
    // Instant update
    elements.toxicityProgress.style.transition = 'none';
    elements.toxicityProgress.style.width = progressPct + '%';
  }
  
  // Color progress bar based on level
  const progressColors = {
    low: 'safe',
    medium: 'warning',
    high: 'critical',
    critical: 'critical'
  };
  elements.toxicityProgress.className = 'progress-fill ' + progressColors[toxicity.level];
  
  // Determine which metric is higher
  const isTradePercentageHigher = toxicity.tradePercentage >= toxicity.profitPercentage;
  
  if (shouldAnimate) {
    // Animate percentage counter - show the HIGHER of the two metrics
    animateCountUp(0, maxPercentage, 800, (value) => {
      const metricLabel = isTradePercentageHigher ? ' (trade %)' : ' (profit %)';
      elements.toxicityPercentage.textContent = value.toFixed(1) + '%' + metricLabel;
    });
    
    // Animate trades count
    animateCountUp(0, toxicity.subOneMinuteTrades, 600, (value) => {
      const currentTrades = Math.round(value);
      elements.toxicityTrades.textContent = `${currentTrades}/${toxicity.totalTrades} trades`;
    });
  } else {
    // Instant update
    const metricLabel = isTradePercentageHigher ? ' (trade %)' : ' (profit %)';
    elements.toxicityPercentage.textContent = maxPercentage.toFixed(1) + '%' + metricLabel;
    elements.toxicityTrades.textContent = `${toxicity.subOneMinuteTrades}/${toxicity.totalTrades} trades`;
  }
  elements.toxicityPercentage.style.color = levelColors[toxicity.level];
  
  // Animate profit/loss breakdown for sub-1-min trades
  const profitAtRisk = toxicity.subOneMinuteProfit;
  const lossFromSub1Min = toxicity.subOneMinuteLoss;
  const profitEl = elements.toxicityProfitAmount;
  
  if (profitAtRisk > 0 && lossFromSub1Min > 0) {
    // Both profits and losses
    profitEl.style.color = '#f5a623';
    if (shouldAnimate) {
      animateCountUp(0, profitAtRisk, 800, (value) => {
        profitEl.innerHTML = '<span style="color:#e05a5a;">+$' + value.toFixed(2) + ' profit at risk</span> / <span style="color:#888;">-$' + lossFromSub1Min.toFixed(2) + ' loss counted</span>';
      });
    } else {
      profitEl.innerHTML = '<span style="color:#e05a5a;">+$' + profitAtRisk.toFixed(2) + ' profit at risk</span> / <span style="color:#888;">-$' + lossFromSub1Min.toFixed(2) + ' loss counted</span>';
    }
  } else if (profitAtRisk > 0) {
    // Only profits at risk
    profitEl.style.color = '#e05a5a';
    if (shouldAnimate) {
      animateCountUp(0, profitAtRisk, 1000, (value) => {
        profitEl.textContent = '+$' + value.toFixed(2) + ' profit at risk (not paid out)';
      });
    } else {
      profitEl.textContent = '+$' + profitAtRisk.toFixed(2) + ' profit at risk (not paid out)';
    }
  } else if (lossFromSub1Min > 0) {
    // Only losses (no profit at risk, but losses still count)
    profitEl.style.color = '#888';
    if (shouldAnimate) {
      animateCountUp(0, lossFromSub1Min, 1000, (value) => {
        profitEl.textContent = '-$' + value.toFixed(2) + ' loss from sub-1-min trades (counted)';
      });
    } else {
      profitEl.textContent = '-$' + lossFromSub1Min.toFixed(2) + ' loss from sub-1-min trades (counted)';
    }
  } else {
    // No profit, no loss
    profitEl.textContent = 'No P&L from sub-1-min trades';
    profitEl.style.color = '#00c97d';
  }
  
  // Update suggestions (simple text, no staggered typewriter)
  const suggestions = getToxicitySuggestions(toxicity);
  elements.toxicitySuggestions.innerHTML = suggestions.map(s => `<div style="margin-bottom:4px;">• ${s}</div>`).join('');
  
  if (shouldAnimate) {
    elements.toxicitySuggestions.style.opacity = '0';
    // Fade in suggestions
    requestAnimationFrame(() => {
      elements.toxicitySuggestions.style.transition = 'opacity 0.5s ease';
      elements.toxicitySuggestions.style.opacity = '1';
    });
  } else {
    elements.toxicitySuggestions.style.opacity = '1';
  }
  
  // Update card border based on level
  if (toxicity.level === 'critical') {
    elements.toxicityCard.style.border = '1px solid #ff000044';
  } else if (toxicity.level === 'high') {
    elements.toxicityCard.style.border = '1px solid #e05a5a44';
  } else {
    elements.toxicityCard.style.border = '';
  }
  
  // Release lock after animations complete (or immediately if no animation)
  if (shouldAnimate) {
    setTimeout(() => {
      toxicityUpdateInProgress = false;
    }, 1200);
  } else {
    toxicityUpdateInProgress = false;
  }
}

// Update progress bar
function updateProgressBar(progressEl, textEl, current, limit, isProfit = false) {
  const pct = Math.min((current / limit) * 100, 100);
  progressEl.style.width = pct + '%';
  
  if (isProfit) {
    progressEl.className = 'progress-fill profit';
    textEl.textContent = (current * 100).toFixed(2) + '%';
  } else {
    textEl.textContent = (current * 100).toFixed(2) + '%';
    if (pct >= 100) {
      progressEl.className = 'progress-fill critical';
    } else if (pct >= 80) {
      progressEl.className = 'progress-fill warning';
    } else {
      progressEl.className = 'progress-fill safe';
    }
  }
}

// Add violation to list
function addViolation(violation) {
  elements.violationsSection.style.display = 'block';
  
  const item = document.createElement('div');
  item.className = 'violation-item ' + violation.severity;
  item.innerHTML = `
    <div class="violation-rule">${violation.rule}</div>
    <div class="violation-message">${violation.message}</div>
  `;
  
  elements.violationsList.insertBefore(item, elements.violationsList.firstChild);
  
  // Keep only last 5 violations in UI
  while (elements.violationsList.children.length > 5) {
    elements.violationsList.removeChild(elements.violationsList.lastChild);
  }
}

// Update rules accordion
function updateRulesAccordion() {
  const effectiveAccountType = currentSettings.accountType || currentState.accountType;
  const effectiveStage = currentSettings.currentStage || currentState.currentStage;
  const cr = currentState.challengeRules;
  const accountSize = currentState.accountSize || currentSettings.accountSize;

  // Always render the accordion, using defaults if API data not available
  const dailyLoss = cr?.maxDailyLoss ?? (effectiveAccountType === 'two_step' ? 5 : 3);
  const totalLoss = cr?.maxTotalLoss ?? (effectiveAccountType === 'two_step' ? 10 : 6);
  let profitTarget = null;
  if (effectiveStage === 'stage2' || effectiveStage === 'step2') {
    profitTarget = cr?.step2ProfitTarget ?? 5;
  } else if (effectiveStage && effectiveStage !== 'funded') {
    profitTarget = cr?.step1ProfitTarget ?? (effectiveAccountType === 'two_step' ? 8 : 10);
  }
  const minDays = cr?.minTradingDays ?? (effectiveAccountType === 'two_step' ? 5 : (effectiveAccountType === 'one_step' ? 3 : 7));

  let html = '';

  // ── Overview ─────────────────────────────────────────────────────────────
  const challengeName = cr ? (effectiveAccountType === 'instant_funding' ? 'Instant Funding'
    : effectiveAccountType === 'one_step' ? 'One-Step Evaluation'
    : 'Two-Step Evaluation (Starter)') : (effectiveAccountType === 'instant_funding' ? 'Instant Funding'
    : effectiveAccountType === 'one_step' ? 'One-Step Evaluation'
    : effectiveAccountType === 'two_step' ? 'Two-Step Evaluation'
    : 'Unknown');
  const stageLabel = effectiveStage
    ? effectiveStage.charAt(0).toUpperCase() + effectiveStage.slice(1).replace('_', ' ')
    : 'Unknown';
  const profitSplit = '80%';

  const overviewContent = `
    <div class="rule-detail"><span class="rule-detail-label">Challenge Type</span><span class="rule-detail-value">${challengeName}</span></div>
    <div class="rule-detail"><span class="rule-detail-label">Current Stage</span><span class="rule-detail-value" style="color:#4caf50;">${stageLabel}</span></div>
    ${accountSize ? `<div class="rule-detail"><span class="rule-detail-label">Account Size</span><span class="rule-detail-value">$${parseFloat(accountSize).toLocaleString()}</span></div>` : ''}
    <div class="rule-detail"><span class="rule-detail-label">Profit Split</span><span class="rule-detail-value" style="color:#4caf50;">${profitSplit}</span></div>
    <div class="rule-detail"><span class="rule-detail-label">Inactivity Limit</span><span class="rule-detail-value">30 days</span></div>
    <div class="rule-detail"><span class="rule-detail-label">Weekend Holding</span><span class="rule-detail-value" style="color:#4caf50;">✅ Allowed</span></div>
    <div class="rule-detail"><span class="rule-detail-label">Overnight Holding</span><span class="rule-detail-value" style="color:#4caf50;">✅ Allowed</span></div>
  `;
  html += createAccordionItem('Overview', overviewContent);

  // ── Current Stage Rules ───────────────────────────────────────────────────
  const stageContent = `
    ${dailyLoss != null ? `<div class="rule-detail"><span class="rule-detail-label">Max Daily Loss</span><span class="rule-detail-value" style="color:#ff6b6b;">${dailyLoss}% of daily start balance</span></div>` : ''}
    ${totalLoss != null ? `<div class="rule-detail"><span class="rule-detail-label">Max Total Drawdown</span><span class="rule-detail-value" style="color:#ff6b6b;">${totalLoss}% of initial balance</span></div>` : ''}
    ${profitTarget != null ? `<div class="rule-detail"><span class="rule-detail-label">Profit Target</span><span class="rule-detail-value" style="color:#4caf50;">${profitTarget}%</span></div>` : (effectiveStage === 'funded' ? '<div class="rule-detail"><span class="rule-detail-label">Profit Target</span><span class="rule-detail-value" style="color:#4caf50;">None (Funded ✅)</span></div>' : '')}
    ${minDays != null ? `<div class="rule-detail"><span class="rule-detail-label">Min Trading Days</span><span class="rule-detail-value">${minDays} days</span></div>` : ''}
    <div class="rule-detail"><span class="rule-detail-label">Daily Loss Reset</span><span class="rule-detail-value">2:00 AM UTC</span></div>
    <div class="rule-detail"><span class="rule-detail-label">Drawdown Type</span><span class="rule-detail-value">Balance-based</span></div>
  `;
  html += createAccordionItem('Current Stage Rules', stageContent);

  // ── Common Rules ──────────────────────────────────────────────────────────
  const commonContent = `
    <div class="rule-detail"><span class="rule-detail-label">Leverage (Forex)</span><span class="rule-detail-value">Up to 1:100</span></div>
    <div class="rule-detail"><span class="rule-detail-label">Leverage (Commodities)</span><span class="rule-detail-value">Up to 1:30</span></div>
    <div class="rule-detail"><span class="rule-detail-label">Leverage (Crypto)</span><span class="rule-detail-value">Up to 1:2</span></div>
    <div class="rule-detail"><span class="rule-detail-label">Payout Day</span><span class="rule-detail-value">Monday</span></div>
    <div class="rule-detail"><span class="rule-detail-label">Min Payout</span><span class="rule-detail-value">$100</span></div>
    <div class="rule-detail"><span class="rule-detail-label">Payout Methods</span><span class="rule-detail-value">USDT (ERC20 / BEP20 / TRC20)</span></div>
    <div class="rule-detail"><span class="rule-detail-label">Processing Time</span><span class="rule-detail-value">&lt;2 hrs (up to 24 hrs)</span></div>
    <div class="rule-detail"><span class="rule-detail-label">News Trading</span><span class="rule-detail-value" style="color:#f0a500;">⚠️ Profits within 3 min of high-impact news may not count (funded)</span></div>
  `;
  html += createAccordionItem('Common Rules', commonContent);

  // ── Prohibited Activities ─────────────────────────────────────────────────
  const prohibitedContent = `
    <div class="rule-detail"><span class="rule-detail-label">Hedging Across Accounts</span><span class="rule-detail-value" style="color:#ff4757;">❌ Prohibited</span></div>
    <div class="rule-detail"><span class="rule-detail-label">Copy Trading</span><span class="rule-detail-value" style="color:#ff4757;">❌ Prohibited</span></div>
    <div class="rule-detail"><span class="rule-detail-label">High-Frequency Trading</span><span class="rule-detail-value" style="color:#ff4757;">❌ Prohibited</span></div>
    <div class="rule-detail"><span class="rule-detail-label">Third-Party Pass EAs</span><span class="rule-detail-value" style="color:#ff4757;">❌ Prohibited</span></div>
    <div class="rule-detail"><span class="rule-detail-label">Trading on Behalf of Others</span><span class="rule-detail-value" style="color:#ff4757;">❌ Prohibited</span></div>
    <div class="rule-detail"><span class="rule-detail-label">Allowed EAs</span><span class="rule-detail-value" style="color:#4caf50;">✅ Personal strategies, trade/risk management only</span></div>
  `;
  html += createAccordionItem('Prohibited Activities', prohibitedContent);

  // ── Rule Examples ─────────────────────────────────────────────────────────
  const examplesContent = `
    <p style="color:#888;font-size:11px;margin-bottom:10px;">Concrete scenarios to help you understand how each rule applies in practice.</p>

    <div style="margin-bottom:12px;border-left:3px solid #f0a500;padding-left:10px;">
      <div style="font-size:12px;font-weight:600;color:#f0a500;margin-bottom:4px;">📅 Daily Loss — Day 2 with Profits</div>
      <div style="font-size:11px;color:#aaa;margin-bottom:4px;"><strong style="color:#ccc;">Scenario:</strong> $10,000 Instant Funded (3% daily loss). Day 1 you made $500. At 2 AM UTC on Day 2 balance = $10,500.</div>
      <div style="font-size:11px;color:#aaa;"><strong style="color:#4caf50;">Result:</strong> Daily limit resets from the new start balance. Day 2 limit = 3% × $10,500 = <strong style="color:#ff6b6b;">$315</strong>. Equity hitting $10,185 or below = account failed immediately.</div>
    </div>

    <div style="margin-bottom:12px;border-left:3px solid #a78bfa;padding-left:10px;">
      <div style="font-size:12px;font-weight:600;color:#a78bfa;margin-bottom:4px;">⚖️ Consistency Rule — 15% Single-Day Cap</div>
      <div style="font-size:11px;color:#aaa;margin-bottom:4px;"><strong style="color:#ccc;">Scenario:</strong> You have $1,000 total profits. You make $250 in one great day.</div>
      <div style="font-size:11px;color:#aaa;"><strong style="color:#4caf50;">Result:</strong> Daily cap = 15% × $1,000 = $150. $250 exceeds the cap by $100. Trading continues — rule is only checked at <strong style="color:#f0a500;">payout time</strong>. Accumulate more profits on other days until the ratio is back within 15%.</div>
    </div>

    <div style="margin-bottom:12px;border-left:3px solid #ff6b6b;padding-left:10px;">
      <div style="font-size:12px;font-weight:600;color:#ff6b6b;margin-bottom:4px;">🛡️ Max Loss — Total Loss Floor</div>
      <div style="font-size:11px;color:#aaa;margin-bottom:4px;"><strong style="color:#ccc;">Scenario:</strong> $10,000 Instant Funded (6% max total loss). Account draws down steadily over several days.</div>
      <div style="font-size:11px;color:#aaa;"><strong style="color:#4caf50;">Result:</strong> Absolute floor = $9,400 (6% × $10,000 = $600 max loss). Equity touching or dropping below <strong style="color:#ff6b6b;">$9,400</strong> = account terminated immediately, regardless of daily loss allowance.</div>
    </div>

    <div style="margin-bottom:12px;border-left:3px solid #4caf50;padding-left:10px;">
      <div style="font-size:12px;font-weight:600;color:#4caf50;margin-bottom:4px;">📆 Trading Days — Minimum 7 Before Payout</div>
      <div style="font-size:11px;color:#aaa;margin-bottom:4px;"><strong style="color:#ccc;">Scenario:</strong> You are ready to request payout after only 4 calendar days of trading.</div>
      <div style="font-size:11px;color:#aaa;"><strong style="color:#4caf50;">Result:</strong> Payout is <strong style="color:#ff6b6b;">blocked</strong> until at least 1 trade is placed on <strong>7 separate calendar days</strong>. Days with no trades do not count.</div>
    </div>

    <div style="border-left:3px solid #ff4757;padding-left:10px;">
      <div style="font-size:12px;font-weight:600;color:#ff4757;margin-bottom:4px;">⚡ HFT Violation — 4+ Orders in 3 Minutes</div>
      <div style="font-size:11px;color:#aaa;margin-bottom:4px;"><strong style="color:#ccc;">Scenario:</strong> Trading BTC/USD — 4 filled orders in the same direction within a 3-minute window.</div>
      <div style="font-size:11px;color:#aaa;margin-bottom:3px;"><strong style="color:#f0a500;">1st Offence:</strong> Official warning issued.</div>
      <div style="font-size:11px;color:#aaa;"><strong style="color:#ff4757;">2nd Offence:</strong> Account immediately failed. No further appeal.</div>
    </div>
  `;
  html += createAccordionItem('Rule Examples', examplesContent);


  // Restore previously open accordion items
  document.querySelectorAll('.accordion-item').forEach((item, i) => {
    if (openAccordionItems.has(i)) item.classList.add('open');
  });

  // Add click handlers for accordion
  document.querySelectorAll('.accordion-header').forEach((header, i) => {
    header.addEventListener('click', () => {
      header.parentElement.classList.toggle('open');
      // Persist open state
      if (header.parentElement.classList.contains('open')) {
        openAccordionItems.add(i);
      } else {
        openAccordionItems.delete(i);
      }
    });
  });
}

// Create accordion item
function createAccordionItem(title, content) {
  return `
    <div class="accordion-item">
      <div class="accordion-header">
        <span class="accordion-title">${title}</span>
        <span class="accordion-icon">▼</span>
      </div>
      <div class="accordion-content">
        <div class="accordion-body">${content}</div>
      </div>
    </div>
  `;
}

// Update trading activity display
function updateTradingActivity() {
  const tradingActivity = document.getElementById('trading-activity');
  if (!tradingActivity) return;
  
  // Check if we have any activity data
  const hasPositions = currentState.openPositions && currentState.openPositions.length > 0;
  const hasOrders = currentState.openOrders && currentState.openOrders.length > 0;
  const hasTrades = currentState.tradeHistory && currentState.tradeHistory.length > 0;
  
  if (hasPositions || hasOrders || hasTrades) {
    tradingActivity.style.display = 'block';
  } else {
    tradingActivity.style.display = 'none';
    return;
  }
  
  // Update Positions
  const positionsSection = document.getElementById('positions-section');
  const positionsList = document.getElementById('positions-list');
  const positionsCount = document.getElementById('positions-count');
  
  if (hasPositions) {
    positionsSection.style.display = 'block';
    positionsCount.textContent = currentState.openPositions.length;
    
    // Track new positions for min-trade-time notification
    const now = Date.now();
    const prevPositionIds = new Set((window._lastPositionIds || []));
    const currentPositionIds = new Set();
    
    positionsList.innerHTML = currentState.openPositions.map(pos => {
      const posId = pos.id || `${pos.symbol}-${pos.openTime}`;
      currentPositionIds.add(posId);
      
      // Check if this is a new position (opened within last 5 seconds)
      const utcStr = pos.openTime ? (pos.openTime.endsWith('Z') ? pos.openTime : pos.openTime + 'Z') : null;
      const openTimeMs = utcStr ? new Date(utcStr).getTime() : 0;
      const isNewPosition = !prevPositionIds.has(posId) && (now - openTimeMs < 5000);
      
      // Show min-trade-time warning for new positions
      if (isNewPosition) {
        showMinTradeTimeNotification(pos.symbol || 'Trade', 60);
      }
      
      // Show lot size: if quantity >= 1, divide by 100; if < 1, it's already in lots
      const qty = pos.size || 0;
      const lotSize = qty >= 1 ? (qty / 100).toFixed(2) : qty.toFixed(4);
      const entryPrice = pos.entryPrice ? parseFloat(pos.entryPrice).toFixed(2) : '?';
      const side = pos.side || 'LONG';
      const pnlText = pos.pnl != null
        ? `<span class="activity-pnl ${pos.pnl >= 0 ? 'positive' : 'negative'}">${pos.pnl >= 0 ? '+' : ''}$${Math.abs(pos.pnl).toFixed(2)}</span>`
        : '';
      // Open time and live duration - use local timezone automatically
      let timeText = '';
      let durationId = '';
      if (pos.openTime) {
        const utcStr2 = pos.openTime.endsWith('Z') ? pos.openTime : pos.openTime + 'Z';
        const openDate = new Date(utcStr2);
        timeText = openDate.toLocaleString([], { month: 'numeric', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
        durationId = `dur-${pos.id || pos.symbol || Math.random().toString(36).slice(2, 9)}`;
      }
      return `
        <div class="activity-item" data-open-time="${pos.openTime || ''}">
          <div class="activity-item-header">
            <span class="activity-symbol">${pos.symbol || 'Unknown'}</span>
            <span class="activity-side ${side === 'LONG' ? 'buy' : 'sell'}">${side}</span>
          </div>
          <div class="activity-details">
            <span style="color:#aaa;font-size:11px;">${lotSize} lots @ $${entryPrice}</span>
            ${pnlText}
          </div>
          <div style="font-size:10px;color:#666;margin-top:3px;display:flex;justify-content:space-between;">
            <span>Opened: ${timeText}</span>
            ${durationId ? `<span id="${durationId}" class="live-duration" style="color:#f0a500;">&#9679; --</span>` : ''}
          </div>
        </div>`;
    }).join('');
    
    // Save current position IDs for next comparison
    window._lastPositionIds = Array.from(currentPositionIds);
  } else {
    positionsSection.style.display = 'none';
    window._lastPositionIds = [];
  }
  
  // Update Open Orders
  const ordersSection = document.getElementById('orders-section');
  const ordersList = document.getElementById('orders-list');
  const ordersCount = document.getElementById('orders-count');
  
  if (hasOrders) {
    ordersSection.style.display = 'block';
    ordersCount.textContent = currentState.openOrders.length;
    ordersList.innerHTML = currentState.openOrders.map(order => `
      <div class="activity-item">
        <div class="activity-item-header">
          <span class="activity-symbol">${order.symbol || 'Unknown'}</span>
          <span class="activity-side ${order.side?.toLowerCase()}">${order.side || 'Unknown'}</span>
        </div>
        <div class="activity-details">
          <span>${order.type || 'Market'} ${order.price ? '@ $' + order.price : ''}</span>
          <span>${order.size ? order.size + ' lots' : ''}</span>
        </div>
      </div>
    `).join('');
  } else {
    ordersSection.style.display = 'none';
  }

  // Render trades with pagination
  renderTrades();

  // Start live duration timer
  startLiveDurationTimer();
}

// Live duration timer - updates every second
let liveDurationInterval = null;

// Min trade time notification (trade < 1 min = no profit)
let minTradeTimeNotifications = new Map();
function showMinTradeTimeNotification(symbol, seconds) {
  const id = `min-trade-${Date.now()}`;
  const notification = document.createElement('div');
  notification.id = id;
  notification.style.cssText = `
    position: fixed;
    top: 10px;
    right: 10px;
    background: linear-gradient(135deg, #ff6b6b 0%, #ee5a5a 100%);
    color: white;
    padding: 12px 16px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 500;
    box-shadow: 0 4px 12px rgba(255, 107, 107, 0.4);
    z-index: 10000;
    max-width: 280px;
    animation: slideIn 0.3s ease;
  `;
  notification.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
      <span style="font-size:16px;">⚠️</span>
      <span style="font-weight:600;">Min Trade Time Rule</span>
    </div>
    <div style="font-size:12px;opacity:0.95;line-height:1.4;">
      Closing <strong>${symbol}</strong> within <span id="${id}-countdown" style="font-weight:700;font-size:14px;">${seconds}</span>s = <strong>NO PROFIT</strong>
    </div>
    <div style="margin-top:6px;font-size:10px;opacity:0.8;">Trade must be open ≥ 60 seconds</div>
  `;
  
  // Add animation styles if not present
  if (!document.getElementById('min-trade-anim')) {
    const style = document.createElement('style');
    style.id = 'min-trade-anim';
    style.textContent = `
      @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
      @keyframes slideOut { from { transform: translateX(0); opacity: 1; } to { transform: translateX(100%); opacity: 0; } }
    `;
    document.head.appendChild(style);
  }
  
  document.body.appendChild(notification);
  
  // Countdown timer
  let remaining = seconds;
  const countdownEl = document.getElementById(`${id}-countdown`);
  const interval = setInterval(() => {
    remaining--;
    if (countdownEl) countdownEl.textContent = remaining;
    if (remaining <= 0) {
      clearInterval(interval);
      notification.style.animation = 'slideOut 0.3s ease forwards';
      setTimeout(() => notification.remove(), 300);
      minTradeTimeNotifications.delete(id);
    }
  }, 1000);
  
  minTradeTimeNotifications.set(id, { interval, notification });
  
  // Auto-remove after 60 seconds regardless
  setTimeout(() => {
    if (minTradeTimeNotifications.has(id)) {
      clearInterval(interval);
      if (notification.parentNode) {
        notification.style.animation = 'slideOut 0.3s ease forwards';
        setTimeout(() => notification.remove(), 300);
      }
      minTradeTimeNotifications.delete(id);
    }
  }, seconds * 1000);
}

function startLiveDurationTimer() {
  if (liveDurationInterval) clearInterval(liveDurationInterval);
  liveDurationInterval = setInterval(() => {
    document.querySelectorAll('.live-duration').forEach(el => {
      const item = el.closest('.activity-item');
      const openTime = item?.dataset.openTime;
      if (!openTime) return;
      const utcStr = openTime.endsWith('Z') ? openTime : openTime + 'Z';
      const openDate = new Date(utcStr);
      const elapsed = Math.floor((Date.now() - openDate.getTime()) / 1000);
      const h = Math.floor(elapsed / 3600);
      const m = Math.floor((elapsed % 3600) / 60);
      const s = elapsed % 60;
      el.textContent = '\u25cf ' + (h > 0 ? `${h}h ${m}m ${s}s` : m > 0 ? `${m}m ${s}s` : `${s}s`);
    });
  }, 1000);
  // Initial update
  document.querySelectorAll('.live-duration').forEach(el => {
    const item = el.closest('.activity-item');
    const openTime = item?.dataset.openTime;
    if (!openTime) return;
    const utcStr = openTime.endsWith('Z') ? openTime : openTime + 'Z';
    const openDate = new Date(utcStr);
    const elapsed = Math.floor((Date.now() - openDate.getTime()) / 1000);
    const h = Math.floor(elapsed / 3600);
    const m = Math.floor((elapsed % 3600) / 60);
    const s = elapsed % 60;
    el.textContent = '\u25cf ' + (h > 0 ? `${h}h ${m}m ${s}s` : m > 0 ? `${m}m ${s}s` : `${s}s`);
  });
}

// Trades visible count (pagination)
let visibleTradesCount = 3;
const openAccordionItems = new Set(); // tracks which accordion panels are open

// Render trade cards
function renderTradeCard(trade) {
  const pnlText = `<span class="activity-pnl ${trade.pnl >= 0 ? 'positive' : 'negative'}">${trade.pnl >= 0 ? '+' : ''}$${Math.abs(trade.pnl).toFixed(2)}</span>`;
  const entryP = parseFloat(trade.entryPrice).toFixed(2);
  const exitP = parseFloat(trade.exitPrice).toFixed(2);
  const lotSize = trade.size >= 1 ? (trade.size / 100).toFixed(2) : (trade.size || 0).toFixed(4);
  const priceText = `${lotSize} lots &nbsp; $${entryP} → $${exitP}`;
  const closeUTC = trade.closeTime ? (trade.closeTime.endsWith('Z') ? trade.closeTime : trade.closeTime + 'Z') : null;
  const openUTC = trade.openTime ? (trade.openTime.endsWith('Z') ? trade.openTime : trade.openTime + 'Z') : null;
  const timeText = closeUTC ? new Date(closeUTC).toLocaleString([], { month: 'numeric', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : '';
  let durationText = '';
  if (openUTC && closeUTC) {
    const elapsed = Math.floor((new Date(closeUTC) - new Date(openUTC)) / 1000);
    const h = Math.floor(elapsed / 3600);
    const m = Math.floor((elapsed % 3600) / 60);
    const s = elapsed % 60;
    durationText = h > 0 ? `${h}h ${m}m ${s}s` : m > 0 ? `${m}m ${s}s` : `${s}s`;
  }
  return `
    <div class="activity-item">
      <div class="activity-item-header">
        <span class="activity-symbol">${trade.symbol || 'Unknown'}</span>
        <span class="activity-side ${trade.side === 'LONG' ? 'buy' : 'sell'}">${trade.side || '?'}</span>
      </div>
      <div class="activity-details">
        <span style="color:#aaa;font-size:11px;">${priceText}</span>
        ${pnlText}
      </div>
      <div style="font-size:10px;color:#666;margin-top:2px;display:flex;justify-content:space-between;">
        <span>${timeText}</span>
        ${durationText ? `<span style="color:#888;">&#9679; ${durationText}</span>` : ''}
      </div>
    </div>`;
}

function renderTrades() {
  const tradesSection = document.getElementById('trades-section');
  const tradesList = document.getElementById('trades-list');
  const tradesCount = document.getElementById('trades-count');
  const trades = currentState.tradeHistory || [];

  if (trades.length === 0) {
    tradesSection.style.display = 'none';
    return;
  }

  tradesSection.style.display = 'block';
  tradesCount.textContent = trades.length;

  const visible = trades.slice(0, visibleTradesCount);
  const hasMore = trades.length > visibleTradesCount;

  tradesList.innerHTML = visible.map(renderTradeCard).join('') +
    (hasMore
      ? `<div style="text-align:center;margin-top:8px;">
          <button id="load-more-trades" style="background:#2a2a3a;border:1px solid #444;color:#aaa;padding:6px 20px;border-radius:8px;cursor:pointer;font-size:12px;">Load more (${Math.min(3, trades.length - visibleTradesCount)} more)</button>
        </div>`
      : visibleTradesCount > 3
        ? `<div style="text-align:center;margin-top:8px;">
            <button id="show-less-trades" style="background:#2a2a3a;border:1px solid #444;color:#aaa;padding:6px 20px;border-radius:8px;cursor:pointer;font-size:12px;">Show less</button>
          </div>`
        : '');

  const loadBtn = document.getElementById('load-more-trades');
  if (loadBtn) {
    loadBtn.addEventListener('click', () => {
      visibleTradesCount += 3;
      renderTrades();
    });
  }
  const lessBtn = document.getElementById('show-less-trades');
  if (lessBtn) {
    lessBtn.addEventListener('click', () => {
      visibleTradesCount = 3;
      renderTrades();
    });
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initialize);
