/**
 * Background Service Worker
 * Manages state, notifications, and communication between content script and popup
 */

// Default settings
const DEFAULT_SETTINGS = {
  enabled: true,
  showWarnings: true,
  showNotifications: true,
  warningThreshold: 0.8, // Warn at 80% of limit
  accountType: null,
  accountSize: null,
  currentStage: null
};

// State management
let tradingState = {
  isOnPlatform: false,
  currentEquity: null,
  balance: null,
  dailyStartBalance: null,
  dailyHighBalance: null,
  accountType: null,
  accountSize: null,
  currentStage: null,
  challengeRules: null,
  unrealizedPnl: null,
  openPositions: [],
  openOrders: [],
  tradeHistory: [],
  todayTrades: [],
  violations: [],
  lastCheck: null
};

// Initialize extension
chrome.runtime.onInstalled.addListener(() => {
  console.log('TheFundedRoom Rules Guardian installed');
  chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
  chrome.storage.local.set({ tradingState: tradingState });
});

// Handle messages from content script and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'TRADING_DATA_UPDATE':
      handleTradingDataUpdate(message.data);
      sendResponse({ success: true });
      break;
    
    case 'VIOLATION_DETECTED':
      handleViolation(message.violation);
      sendResponse({ success: true });
      break;
    
    case 'GET_STATE':
      sendResponse({ state: tradingState });
      break;
    
    case 'UPDATE_SETTINGS':
      updateSettings(message.settings);
      sendResponse({ success: true });
      break;
    
    case 'GET_SETTINGS':
      chrome.storage.local.get('settings', (result) => {
        sendResponse({ settings: result.settings || DEFAULT_SETTINGS });
      });
      return true; // Keep channel open for async
    
    case 'RESET_DAILY':
      resetDailyStats();
      sendResponse({ success: true });
      break;
    
    case 'PLATFORM_DETECTED':
      tradingState.isOnPlatform = true;
      broadcastToPopup({ type: 'PLATFORM_STATUS', isOnPlatform: true });
      sendResponse({ success: true });
      break;
    
    case 'PLATFORM_LEFT':
      tradingState.isOnPlatform = false;
      broadcastToPopup({ type: 'PLATFORM_STATUS', isOnPlatform: false });
      sendResponse({ success: true });
      break;
  }
  return true;
});

// Handle trading data updates from content script
async function handleTradingDataUpdate(data) {
  // Update all fields from content script
  tradingState.currentEquity = data.currentEquity;
  tradingState.balance = data.balance;
  tradingState.dailyStartBalance = data.dailyStartBalance;
  tradingState.dailyHighBalance = data.dailyHighBalance;
  tradingState.todayTrades = data.todayTrades || [];
  tradingState.openPositions = data.openPositions || [];
  tradingState.openOrders = data.openOrders || [];
  tradingState.tradeHistory = data.tradeHistory || [];
  tradingState.unrealizedPnl = data.unrealizedPnl;
  tradingState.lastCheck = Date.now();
  
  // Only update account info if API provided it (don't overwrite with null)
  if (data.accountType) tradingState.accountType = data.accountType;
  if (data.accountSize) tradingState.accountSize = data.accountSize;
  if (data.currentStage) tradingState.currentStage = data.currentStage;
  if (data.challengeRules) tradingState.challengeRules = data.challengeRules;
  
  console.log('TFR Background: State updated - accountType:', tradingState.accountType, 'accountSize:', tradingState.accountSize, 'stage:', tradingState.currentStage);
  
  // Save to storage
  await chrome.storage.local.set({ tradingState: tradingState });
  
  // Broadcast to popup if open
  broadcastToPopup({
    type: 'TRADING_STATE_UPDATE',
    state: tradingState
  });
}

// Handle rule violations
async function handleViolation(violation) {
  const { settings } = await chrome.storage.local.get('settings');
  
  if (!settings || !settings.enabled) return;
  
  // Add to violations list
  tradingState.violations.unshift({
    ...violation,
    timestamp: Date.now()
  });
  
  // Keep only last 50 violations
  if (tradingState.violations.length > 50) {
    tradingState.violations = tradingState.violations.slice(0, 50);
  }
  
  await chrome.storage.local.set({ tradingState: tradingState });
  
  // Show notification for critical violations
  if (violation.severity === 'critical' && settings.showNotifications) {
    showNotification(violation);
  }
  
  // Broadcast to popup
  broadcastToPopup({
    type: 'NEW_VIOLATION',
    violation: violation
  });
}

// Show browser notification
function showNotification(violation) {
  const iconMap = {
    critical: 'icons/icon128.png',
    warning: 'icons/icon128.png',
    info: 'icons/icon128.png'
  };
  
  chrome.notifications.create({
    type: 'basic',
    iconUrl: iconMap[violation.severity] || 'icons/icon128.png',
    title: violation.severity === 'critical' ? '⚠️ CRITICAL RULE VIOLATION' : 'Trading Rule Warning',
    message: violation.message,
    priority: violation.severity === 'critical' ? 2 : 1,
    requireInteraction: violation.severity === 'critical'
  });
}

// Update settings
async function updateSettings(newSettings) {
  const { settings } = await chrome.storage.local.get('settings');
  const updatedSettings = { ...settings, ...newSettings };
  await chrome.storage.local.set({ settings: updatedSettings });
}

// Reset daily statistics
async function resetDailyStats() {
  tradingState.todayTrades = [];
  tradingState.violations = [];
  await chrome.storage.local.set({ tradingState: tradingState });
}

// Broadcast message to popup
function broadcastToPopup(message) {
  chrome.runtime.sendMessage(message).catch(() => {
    // Popup might not be open, ignore error
  });
}

// Check for new day and reset if needed
function checkNewDay() {
  const now = new Date();
  const utcHours = now.getUTCHours();
  
  // Reset at 2 AM UTC
  if (utcHours === 2 && tradingState.lastCheck) {
    const lastCheckDate = new Date(tradingState.lastCheck);
    if (lastCheckDate.getUTCDate() !== now.getUTCDate()) {
      resetDailyStats();
    }
  }
}

// Periodic check
setInterval(checkNewDay, 60000); // Check every minute

// Listen for tab updates to detect platform
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    const isPlatform = tab.url.includes('thefundedroom.com');
    if (isPlatform) {
      tradingState.isOnPlatform = true;
    }
  }
});

// Listen for tab activation
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const tab = await chrome.tabs.get(activeInfo.tabId);
  if (tab.url && tab.url.includes('thefundedroom.com')) {
    tradingState.isOnPlatform = true;
  } else {
    tradingState.isOnPlatform = false;
  }
});
