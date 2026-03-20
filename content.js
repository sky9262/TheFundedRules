

// RulesEngine, AccountTypes, ViolationSeverity are loaded from rules.js via manifest

// Account type detection patterns
const ACCOUNT_TYPE_PATTERNS = {
  instant_funding: ['instant funding', 'instant', 'no evaluation'],
  one_step: ['one step', 'one-step', '1 step', '1-step'],
  two_step: ['two step', 'two-step', '2 step', '2-step']
};

// Stage detection patterns
const STAGE_PATTERNS = {
  evaluation: ['evaluation', 'challenge', 'stage 1', 'phase 1'],
  stage2: ['stage 2', 'phase 2', 'verification'],
  funded: ['funded', 'live', 'real account']
};

// Trading state
let tradingData = {
  accountType: null,
  accountSize: null,
  currentStage: null,
  currentEquity: null,
  balance: null,
  dailyStartBalance: null,
  dailyHighBalance: null,
  todayTrades: [],
  openPositions: [],
  openOrders: [],
  orderHistory: [],
  tradeHistory: [],
  rulesEngine: null,
  accountId: null,  // Extracted from URL
  // Toxicity tracking
  toxicity: {
    level: 'low', // low, medium, high, critical
    subOneMinuteTrades: 0,
    totalTrades: 0,
    subOneMinuteProfit: 0,
    totalProfit: 0,
    lastCalculated: null
  }
};

// Track position IDs to detect new trades
let lastPositionIds = new Set();

// Notification positioning system - stack notifications vertically
function getNotificationPosition(index) {
  const baseTop = 20;
  const spacing = 10;
  const notificationHeight = 120; // approximate max height
  return baseTop + (index * (notificationHeight + spacing));
}

function updateAllNotificationPositions() {
  const notifications = [
    document.getElementById('tfr-min-trade-notification'),
    document.getElementById('tfr-hft-warning'),
    document.getElementById('tfr-risk-warning')
  ].filter(n => n !== null);
  
  notifications.forEach((notification, index) => {
    notification.style.top = `${getNotificationPosition(index)}px`;
  });
}

function createCloseButton(onClick) {
  return `<button onclick="${onClick}" style="
    float:right;
    margin:-8px -8px 0 8px;
    background:rgba(255,255,255,0.2);
    border:none;
    color:white;
    width:20px;
    height:20px;
    border-radius:50%;
    font-size:12px;
    cursor:pointer;
    display:flex;
    align-items:center;
    justify-content:center;
    padding:0;
    line-height:1;
    transition:background 0.2s;
    flex-shrink:0;
  " onmouseover="this.style.background='rgba(255,255,255,0.3)'" onmouseout="this.style.background='rgba(255,255,255,0.2)'">×</button>`;
}

// Min trade time notification (trade < 1 min = no profit)
function showMinTradeTimeNotification(symbol, seconds = 60) {
  // Remove existing notification if any
  const existing = document.getElementById('tfr-min-trade-notification');
  if (existing) existing.remove();
  
  const notification = document.createElement('div');
  notification.id = 'tfr-min-trade-notification';
  notification.style.cssText = `
    position: fixed;
    top: ${getNotificationPosition(0)}px;
    right: 20px;
    background: linear-gradient(135deg, #ff6b6b 0%, #ee5a5a 100%);
    color: white;
    padding: 16px 20px;
    border-radius: 12px;
    font-size: 14px;
    font-weight: 500;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    box-shadow: 0 8px 24px rgba(255, 107, 107, 0.4);
    z-index: 999999;
    max-width: 320px;
    animation: tfrSlideIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    border: 1px solid rgba(255, 255, 255, 0.1);
  `;
  
  const closeHandler = `document.getElementById('tfr-min-trade-notification').remove(); updateAllNotificationPositions();`;
  
  notification.innerHTML = `
    ${createCloseButton(closeHandler)}
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
      <span style="font-size:20px;">⚠️</span>
      <span style="font-weight:700;font-size:15px;">Min Trade Time Rule</span>
    </div>
    <div style="font-size:13px;opacity:0.95;line-height:1.5;">
      Closing <strong>${symbol}</strong> within <span id="tfr-min-trade-countdown" style="font-weight:800;font-size:18px;color:#fff;">${seconds}</span>s = <strong style="color:#ffe0e0;">NO PROFIT</strong>
    </div>
    <div style="margin-top:8px;font-size:11px;opacity:0.85;">⏱️ Trade must be open ≥ 60 seconds</div>
  `;
  
  // Add animation styles
  if (!document.getElementById('tfr-min-trade-styles')) {
    const style = document.createElement('style');
    style.id = 'tfr-min-trade-styles';
    style.textContent = `
      @keyframes tfrSlideIn { from { transform: translateX(120%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
      @keyframes tfrSlideOut { from { transform: translateX(0); opacity: 1; } to { transform: translateX(120%); opacity: 0; } }
    `;
    document.head.appendChild(style);
  }
  
  document.body.appendChild(notification);
  updateAllNotificationPositions();
  
  // Countdown timer
  let remaining = seconds;
  const countdownEl = document.getElementById('tfr-min-trade-countdown');
  const interval = setInterval(() => {
    remaining--;
    if (countdownEl) countdownEl.textContent = remaining;
    if (remaining <= 0) {
      clearInterval(interval);
      dismissNotification();
    }
  }, 1000);
  
  // Auto-dismiss after 60 seconds
  setTimeout(() => {
    clearInterval(interval);
    dismissNotification();
  }, seconds * 1000);
  
  function dismissNotification() {
    if (notification.parentNode) {
      notification.style.animation = 'tfrSlideOut 0.3s ease forwards';
      setTimeout(() => {
        notification.remove();
        updateAllNotificationPositions();
      }, 300);
    }
  }
}

// Check for new positions and show notification
function checkForNewPositions(positions) {
  const now = Date.now();
  const currentIds = new Set();
  
  positions.forEach(pos => {
    const posId = pos.id || `${pos.symbol}-${pos.openTime}`;
    currentIds.add(posId);
    
    // Check if this is a new position (not seen before and opened recently)
    if (!lastPositionIds.has(posId) && pos.openTime) {
      const utcStr = pos.openTime.endsWith('Z') ? pos.openTime : pos.openTime + 'Z';
      const openTimeMs = new Date(utcStr).getTime();
      const isNew = (now - openTimeMs) < 10000; // Within last 10 seconds
      
      if (isNew) {
        console.log('TFR Guardian: New position detected, showing min trade time notification:', pos.symbol);
        showMinTradeTimeNotification(pos.symbol || 'Trade', 60);
      }
    }
  });
  
  lastPositionIds = currentIds;
}

// HFT (High-Frequency Trading) protection - max 3 orders in 3 minutes per symbol+direction
const hftTracker = new Map(); // key: "symbol:side" -> [{timestamp, orderId}]
let hftWarningElement = null;

// Clear HFT tracker on page load to prevent stale data
hftTracker.clear();

function recordOrder(symbol, side, orderId) {
  recordOrderWithTimestamp(symbol, side, orderId, Date.now());
}

function recordOrderWithTimestamp(symbol, side, orderId, timestamp) {
  // Track by symbol only (combine BUY + SELL for HFT limit)
  const key = symbol.toUpperCase();
  const now = Date.now();
  const threeMinutesAgo = now - (3 * 60 * 1000);
  
  // Get existing orders for this symbol (all directions)
  let orders = hftTracker.get(key) || [];
  
  // Remove orders older than 3 minutes (from now)
  orders = orders.filter(o => o.timestamp > threeMinutesAgo);
  
  // Check if this order ID already exists (deduplication)
  const alreadyExists = orders.some(o => o.orderId === orderId);
  if (alreadyExists) {
    console.log('TFR Guardian: Order already tracked, skipping:', orderId);
    return; // Don't add duplicate
  }
  
  // Skip if order is older than 3 minutes (historical order)
  if (timestamp < threeMinutesAgo) {
    console.log('TFR Guardian: Order too old, skipping:', { orderId, age: Math.round((now - timestamp) / 1000) + 's' });
    return;
  }
  
  // Add new order with its actual timestamp and side info
  orders.push({ timestamp, orderId, side: side.toUpperCase() });
  hftTracker.set(key, orders);
  
  console.log('TFR Guardian: Recorded new order for HFT tracking:', { symbol, side, orderId, orderTime: new Date(timestamp).toISOString(), totalCount: orders.length });
  
  // Check HFT status and show warning (combined count)
  updateHFTWarning(symbol, orders);
}

function updateHFTWarning(symbol, orders) {
  const count = orders.length;
  const oldestOrder = orders[0];
  
  console.log('TFR Guardian: Updating HFT warning:', { symbol, count, orders: orders.map(o => ({ id: o.orderId, side: o.side, time: new Date(o.timestamp).toISOString() })) });
  
  // Remove existing warning
  if (hftWarningElement) {
    hftWarningElement.remove();
    hftWarningElement = null;
  }
  
  if (count === 0) {
    console.log('TFR Guardian: No orders to show warning for');
    return;
  }
  
  // Determine warning level
  let isCritical = count >= 3;
  let isWarning = count === 2;
  
  // Build side breakdown for display
  const buyCount = orders.filter(o => o.side === 'BUY').length;
  const sellCount = orders.filter(o => o.side === 'SELL').length;
  let sideBreakdown = '';
  if (buyCount > 0 && sellCount > 0) {
    sideBreakdown = `(${buyCount} BUY, ${sellCount} SELL)`;
  } else if (buyCount > 0) {
    sideBreakdown = 'BUY';
  } else if (sellCount > 0) {
    sideBreakdown = 'SELL';
  }
  
  const notification = document.createElement('div');
  notification.id = 'tfr-hft-warning';
  notification.style.cssText = `
    position: fixed;
    top: ${getNotificationPosition(1)}px;
    right: 20px;
    background: ${isCritical 
      ? 'linear-gradient(135deg, #ff4757 0%, #ff6348 100%)' 
      : 'linear-gradient(135deg, #f0a500 0%, #ff9500 100%)'};
    color: white;
    padding: 14px 18px;
    border-radius: 12px;
    font-size: 13px;
    font-weight: 500;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    box-shadow: 0 8px 24px ${isCritical ? 'rgba(255, 71, 87, 0.4)' : 'rgba(240, 165, 0, 0.4)'};
    z-index: 999998;
    max-width: 340px;
    animation: tfrSlideIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    border: 1px solid rgba(255, 255, 255, 0.15);
  `;
  
  const closeHandler = `document.getElementById('tfr-hft-warning').remove(); hftWarningElement = null; updateAllNotificationPositions();`;
  
  // Generate unique ID for the time element
  const timeElementId = `tfr-hft-time-${Date.now()}`;
  
  if (isCritical) {
    // RED: 3+ orders - STOP
    notification.innerHTML = `
      ${createCloseButton(closeHandler)}
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;">
        <span style="font-size:18px;">🚫</span>
        <span style="font-weight:700;font-size:14px;">HFT VIOLATION RISK</span>
      </div>
      <div style="font-size:12px;line-height:1.5;">
        <strong>${count} orders</strong> on <strong>${symbol}</strong> ${sideBreakdown} in 3 min window
      </div>
      <div style="margin-top:6px;font-size:13px;font-weight:700;color:#ffe0e0;">
        ⛔ DO NOT place any order for <span id="${timeElementId}" class="hft-live-time">3:00</span>
      </div>
      <div style="margin-top:4px;font-size:10px;opacity:0.9;">4+ orders = HFT violation = account warning</div>
    `;
  } else if (isWarning) {
    // ORANGE: 2 orders - WARNING
    notification.innerHTML = `
      ${createCloseButton(closeHandler)}
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;">
        <span style="font-size:18px;">⚠️</span>
        <span style="font-weight:700;font-size:14px;">HFT Warning</span>
      </div>
      <div style="font-size:12px;line-height:1.5;">
        <strong>${count} orders</strong> on <strong>${symbol}</strong> ${sideBreakdown} in last 3 minutes
      </div>
      <div style="margin-top:6px;font-size:13px;font-weight:600;">
        🟠 You can place only <strong>1 more order</strong> in <span id="${timeElementId}" class="hft-live-time">3:00</span>
      </div>
      <div style="margin-top:4px;font-size:10px;opacity:0.9;">Next order will trigger HFT limit</div>
    `;
  } else {
    // Info: 1 order
    notification.innerHTML = `
      ${createCloseButton(closeHandler)}
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;">
        <span style="font-size:16px;">ℹ️</span>
        <span style="font-weight:600;font-size:13px;">HFT Tracking</span>
      </div>
      <div style="font-size:12px;">
        <strong>${count} order</strong> on <strong>${symbol}</strong> ${sideBreakdown}
      </div>
      <div style="margin-top:4px;font-size:11px;opacity:0.9;">
        ${3 - count} more allowed within next <span id="${timeElementId}" class="hft-live-time">3:00</span>
      </div>
    `;
  }
  
  document.body.appendChild(notification);
  console.log('TFR Guardian: HFT warning appended to body:', { id: notification.id, count, symbol, sideBreakdown });
  hftWarningElement = notification;
  updateAllNotificationPositions();
  
  // Live countdown updater - updates the time display every second
  const updateTimeDisplay = () => {
    const timeEl = document.getElementById(timeElementId);
    if (!timeEl || !document.body.contains(notification)) return false;
    
    const now = Date.now();
    const threeMinutesAgo = now - (3 * 60 * 1000);
    const currentOrders = hftTracker.get(symbol.toUpperCase()) || [];
    const filtered = currentOrders.filter(o => o.timestamp > threeMinutesAgo);
    
    if (filtered.length === 0) {
      notification.remove();
      hftWarningElement = null;
      updateAllNotificationPositions();
      return false;
    }
    
    // Calculate time remaining based on oldest order
    const oldest = filtered[0];
    const timeRemaining = Math.max(0, (3 * 60 * 1000) - (now - oldest.timestamp));
    const mm = Math.floor(timeRemaining / 60000);
    const ss = Math.floor((timeRemaining % 60000) / 1000);
    const timeStr = `${mm}:${ss.toString().padStart(2, '0')}`;
    
    timeEl.textContent = timeStr;
    return true;
  };
  
  // Initial update
  updateTimeDisplay();
  
  // Start live countdown
  const countdownInterval = setInterval(() => {
    if (!updateTimeDisplay()) {
      clearInterval(countdownInterval);
    }
  }, 1000);
  
  // Also check for order count changes
  const checkInterval = setInterval(() => {
    if (!document.body.contains(notification)) {
      clearInterval(checkInterval);
      return;
    }
    
    const currentOrders = hftTracker.get(symbol.toUpperCase()) || [];
    const filtered = currentOrders.filter(o => o.timestamp > Date.now() - (3 * 60 * 1000));
    
    // Refresh if count changed
    if (filtered.length !== count) {
      updateHFTWarning(symbol, filtered);
      clearInterval(checkInterval);
    }
  }, 1000);
}

// Check HFT status before allowing trade
function checkHFTBeforeTrade(symbol, side) {
  // Use symbol-only key for combined tracking (BUY + SELL count together)
  const key = symbol.toUpperCase();
  const orders = hftTracker.get(key) || [];
  const threeMinutesAgo = Date.now() - (3 * 60 * 1000);
  const recentOrders = orders.filter(o => o.timestamp > threeMinutesAgo);
  
  return {
    canTrade: recentOrders.length < 3,
    currentCount: recentOrders.length,
    isAtLimit: recentOrders.length === 2,
    isOverLimit: recentOrders.length >= 3
  };
}

// Max Risk Per Trade tracking (3% limit in funded stage)
// Multiple trades on same asset same day count as one trade
const riskTracker = new Map(); // key: "symbol:date" -> { totalRiskAmount, totalRiskPercent, positions: [] }
let riskWarningElement = null;

// Toxicity calculation - sub-1-minute trades
function calculateToxicity() {
  const trades = tradingData.tradeHistory || [];
  if (trades.length === 0) {
    tradingData.toxicity = {
      level: 'low',
      subOneMinuteTrades: 0,
      totalTrades: 0,
      subOneMinuteProfit: 0,
      totalProfit: 0,
      tradePercentage: 0,
      profitPercentage: 0,
      lastCalculated: Date.now()
    };
    return tradingData.toxicity;
  }

  let subOneMinuteTrades = 0;
  let subOneMinuteProfit = 0;
  let totalProfit = 0;

  trades.forEach(trade => {
    const pnl = parseFloat(trade.pnl) || 0;
    totalProfit += pnl;

    // Check if trade duration was under 1 minute
    if (trade.openTime && trade.closeTime) {
      const openDate = new Date(trade.openTime);
      const closeDate = new Date(trade.closeTime);
      const durationMs = closeDate - openDate;
      const durationMinutes = durationMs / (1000 * 60);

      if (durationMinutes < 1) {
        subOneMinuteTrades++;
        subOneMinuteProfit += pnl;
      }
    }
  });

  const totalTrades = trades.length;
  const tradePercentage = (subOneMinuteTrades / totalTrades) * 100;
  const profitPercentage = totalProfit > 0 ? (subOneMinuteProfit / totalProfit) * 100 : 0;

  // Determine toxicity level
  let level = 'low';
  if (tradePercentage >= 20 || profitPercentage >= 20) {
    level = 'critical';
  } else if (tradePercentage >= 15 || profitPercentage >= 15) {
    level = 'high';
  } else if (tradePercentage >= 10 || profitPercentage >= 10) {
    level = 'medium';
  }

  tradingData.toxicity = {
    level,
    subOneMinuteTrades,
    totalTrades,
    subOneMinuteProfit,
    totalProfit,
    tradePercentage: parseFloat(tradePercentage.toFixed(2)),
    profitPercentage: parseFloat(profitPercentage.toFixed(2)),
    lastCalculated: Date.now()
  };

  console.log('TFR Guardian: Toxicity calculated:', tradingData.toxicity);
  return tradingData.toxicity;
}

// Get suggestions for reducing toxicity
function getToxicitySuggestions(toxicity) {
  const suggestions = [];
  
  if (toxicity.level === 'low') {
    suggestions.push('Your trading pattern looks healthy. Keep holding trades for at least 1 minute to maintain this.');
    return suggestions;
  }

  // Trade count suggestions
  if (toxicity.tradePercentage >= 10) {
    const tradesNeeded = Math.ceil((toxicity.subOneMinuteTrades * 10 - toxicity.totalTrades) / 9);
    suggestions.push(`Place ${tradesNeeded} more trade${tradesNeeded > 1 ? 's' : ''} held for 1+ minutes to bring sub-1-min percentage below 10%`);
  }

  // Profit-based suggestions
  if (toxicity.profitPercentage >= 10 && toxicity.totalProfit > 0) {
    const targetProfit = Math.ceil(toxicity.subOneMinuteProfit * 10);
    const additionalProfitNeeded = targetProfit - toxicity.totalProfit;
    if (additionalProfitNeeded > 0) {
      suggestions.push(`Generate $${additionalProfitNeeded.toFixed(0)} more in profits from 1+ minute trades to reduce profit toxicity`);
    }
  }

  // General suggestions
  suggestions.push('Hold trades for at least 1 minute before closing to avoid toxic trading flags');
  suggestions.push('Use limit orders instead of market orders to reduce impulse trading');
  
  if (toxicity.level === 'critical') {
    suggestions.push('URGENT: You cannot request payout until toxicity drops below 10%');
  }

  return suggestions;
}

function calculatePositionRisk(position, accountSize) {
  if (!position || !accountSize) return null;
  
  const entryPrice = parseFloat(position.entryPrice) || 0;
  const sizeOz = parseFloat(position.size) || 0;
  const stopLoss = position.stopLoss ? parseFloat(position.stopLoss) : null;
  
  if (!entryPrice || !sizeOz) return null;
  
  // Convert size from oz to lots (1 lot = 100 oz for XAU/USD)
  const lots = sizeOz / 100;
  
  // If no stop loss, we cannot calculate risk - return null to skip
  if (!stopLoss || stopLoss <= 0) {
    console.log('TFR Guardian: No stop loss set, cannot calculate risk for', position.symbol);
    return null;
  }
  
  // Risk = price distance to stop × quantity in oz
  const priceRisk = Math.abs(entryPrice - stopLoss);
  const riskAmount = priceRisk * sizeOz;
  const riskPercent = (riskAmount / accountSize) * 100;
  
  return {
    riskAmount: parseFloat(riskAmount.toFixed(2)),
    riskPercent: parseFloat(riskPercent.toFixed(2)),
    hasStopLoss: true,
    lots: parseFloat(lots.toFixed(2))
  };
}

// Track shown risk warnings to prevent spam
let lastShownRiskKey = null;
let lastShownRiskTime = 0;

function checkMaxRiskPerTrade(positions, accountSize, currentStage) {
  // Only apply in funded stage
  if (!currentStage || currentStage.toLowerCase() !== 'funded') return;
  
  const today = new Date().toISOString().split('T')[0];
  const maxRiskPercent = 3;
  
  // Group positions by symbol
  const symbolRisk = new Map();
  
  positions.forEach(pos => {
    const symbol = (pos.symbol || 'UNKNOWN').toUpperCase();
    const risk = calculatePositionRisk(pos, accountSize);
    if (!risk) return;
    
    const key = `${symbol}:${today}`;
    let existing = symbolRisk.get(key);
    if (!existing) {
      existing = { symbol, totalRiskAmount: 0, totalRiskPercent: 0, positions: [] };
    }
    
    existing.totalRiskAmount += risk.riskAmount;
    existing.totalRiskPercent += risk.riskPercent;
    existing.positions.push({ ...pos, ...risk });
    symbolRisk.set(key, existing);
  });
  
  // Check for violations
  let maxViolation = null;
  symbolRisk.forEach((data, key) => {
    if (data.totalRiskPercent >= maxRiskPercent) {
      if (!maxViolation || data.totalRiskPercent > maxViolation.totalRiskPercent) {
        maxViolation = data;
      }
    }
  });
  
  // Show/update warning (with deduplication)
  if (maxViolation) {
    const riskKey = `${maxViolation.symbol}:${maxViolation.totalRiskPercent.toFixed(1)}`;
    const now = Date.now();
    // Only show if different violation or 30 seconds passed
    if (riskKey !== lastShownRiskKey || (now - lastShownRiskTime) > 30000) {
      updateRiskWarning(maxViolation, maxRiskPercent, accountSize);
      lastShownRiskKey = riskKey;
      lastShownRiskTime = now;
    }
  }
  
  // Also warn if approaching limit (2.5%+)
  let approachingViolation = null;
  symbolRisk.forEach((data, key) => {
    if (data.totalRiskPercent >= 2.5 && data.totalRiskPercent < maxRiskPercent) {
      if (!approachingViolation || data.totalRiskPercent > approachingViolation.totalRiskPercent) {
        approachingViolation = data;
      }
    }
  });
  
  if (!maxViolation && approachingViolation) {
    const riskKey = `approaching:${approachingViolation.symbol}:${approachingViolation.totalRiskPercent.toFixed(1)}`;
    const now = Date.now();
    if (riskKey !== lastShownRiskKey || (now - lastShownRiskTime) > 30000) {
      updateRiskWarning(approachingViolation, maxRiskPercent, accountSize, true);
      lastShownRiskKey = riskKey;
      lastShownRiskTime = now;
    }
  }
}

function updateRiskWarning(violationData, maxRiskPercent, accountSize, isWarning = false) {
  // Remove existing warning
  if (riskWarningElement) {
    riskWarningElement.remove();
    riskWarningElement = null;
  }
  
  if (!violationData) return;
  
  const isCritical = !isWarning && violationData.totalRiskPercent >= maxRiskPercent;
  const remainingPercent = Math.max(0, maxRiskPercent - violationData.totalRiskPercent).toFixed(2);
  
  const notification = document.createElement('div');
  notification.id = 'tfr-risk-warning';
  
  notification.style.cssText = `
    position: fixed;
    top: ${getNotificationPosition(2)}px;
    right: 20px;
    background: ${isCritical 
      ? 'linear-gradient(135deg, #ff4757 0%, #c0392b 100%)' 
      : 'linear-gradient(135deg, #f39c12 0%, #e67e22 100%)'};
    color: white;
    padding: 14px 18px;
    border-radius: 12px;
    font-size: 13px;
    font-weight: 500;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    box-shadow: 0 8px 24px ${isCritical ? 'rgba(255, 71, 87, 0.4)' : 'rgba(243, 156, 18, 0.4)'};
    z-index: 999997;
    max-width: 360px;
    animation: tfrSlideIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    border: 1px solid rgba(255, 255, 255, 0.15);
  `;
  
  const closeHandler = `document.getElementById('tfr-risk-warning').remove(); riskWarningElement = null; updateAllNotificationPositions();`;
  
  if (isCritical) {
    notification.innerHTML = `
      ${createCloseButton(closeHandler)}
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;">
        <span style="font-size:18px;">🚨</span>
        <span style="font-weight:700;font-size:14px;">MAX RISK VIOLATION</span>
      </div>
      <div style="font-size:12px;line-height:1.5;">
        <strong>${violationData.symbol}</strong> risk: <strong style="font-size:14px;">${violationData.totalRiskPercent.toFixed(2)}%</strong> of account
      </div>
      <div style="margin-top:6px;font-size:11px;opacity:0.95;">
        Limit: ${maxRiskPercent}% per trade/symbol/day<br>
        Excess: ${(violationData.totalRiskPercent - maxRiskPercent).toFixed(2)}% over limit
      </div>
      <div style="margin-top:6px;font-size:10px;opacity:0.9;background:rgba(0,0,0,0.2);padding:6px 8px;border-radius:6px;">
        ⚠️ Multiple trades on same asset count as ONE trade for this rule
      </div>
    `;
  } else {
    notification.innerHTML = `
      ${createCloseButton(closeHandler)}
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;">
        <span style="font-size:18px;">⚠️</span>
        <span style="font-weight:700;font-size:14px;">Approaching Max Risk</span>
      </div>
      <div style="font-size:12px;line-height:1.5;">
        <strong>${violationData.symbol}</strong> risk: <strong>${violationData.totalRiskPercent.toFixed(2)}%</strong>
      </div>
      <div style="margin-top:6px;font-size:12px;font-weight:600;">
        🟠 Only ${remainingPercent}% remaining before ${maxRiskPercent}% limit
      </div>
      <div style="margin-top:4px;font-size:10px;opacity:0.9;">
        Multiple trades on same asset count as one trade
      </div>
    `;
  }
  
  document.body.appendChild(notification);
  riskWarningElement = notification;
  updateAllNotificationPositions();
  
  // Auto-remove after 30 seconds for warnings, persist for critical
  if (!isCritical) {
    setTimeout(() => {
      if (riskWarningElement === notification) {
        notification.style.animation = 'tfrSlideOut 0.3s ease forwards';
        setTimeout(() => {
          notification.remove();
          riskWarningElement = null;
          updateAllNotificationPositions();
        }, 300);
      }
    }, 30000);
  }
}

// API Base URL
const API_BASE_URL = 'https://forex-backend-7rqa.onrender.com/api';

// Extract account ID from URL
function extractAccountIdFromUrl() {
  const match = window.location.pathname.match(/\/trade\/(\d+)/);
  if (match) {
    tradingData.accountId = match[1];
    console.log('TFR Guardian: Extracted account ID:', tradingData.accountId);
    return match[1];
  }
  return null;
}

// Fetch orders from API
async function fetchOrdersFromAPI() {
  const accountId = tradingData.accountId || extractAccountIdFromUrl();
  if (!accountId) {
    console.log('TFR Guardian: No account ID found in URL');
    return null;
  }
  
  try {
    const response = await fetch(`${API_BASE_URL}/trading-accounts/${accountId}/orders`, {
      method: 'GET',
      headers: {
        'accept': 'application/json, text/plain, */*',
        'content-type': 'application/json'
      },
      credentials: 'include'
    });
    
    if (!response.ok) {
      console.log('TFR Guardian: API request failed:', response.status);
      return null;
    }
    
    const data = await response.json();
    console.log('TFR Guardian: Fetched orders from API:', data);
    // Log raw first item for structure debugging
    if (Array.isArray(data) && data.length > 0) {
      console.log('TFR Guardian: RAW first order =', JSON.stringify(data[0]));
    } else if (data && data.orders && data.orders.length > 0) {
      console.log('TFR Guardian: RAW first order (wrapped) =', JSON.stringify(data.orders[0]));
    } else {
      console.log('TFR Guardian: RAW orders response =', JSON.stringify(data));
    }
    return data;
  } catch (e) {
    console.error('TFR Guardian: Error fetching orders:', e);
    return null;
  }
}

// Fetch all trading accounts for the user
async function fetchAllTradingAccounts() {
  try {
    const response = await fetch(`${API_BASE_URL}/trading-accounts`, {
      method: 'GET',
      headers: {
        'accept': 'application/json, text/plain, */*',
        'content-type': 'application/json'
      },
      credentials: 'include'
    });
    
    if (!response.ok) {
      console.log('TFR Guardian: Failed to fetch accounts:', response.status);
      return null;
    }
    
    const data = await response.json();
    console.log('TFR Guardian: Fetched all accounts:', data);
    console.log('TFR Guardian: First account keys:', data && data[0] ? Object.keys(data[0]) : 'empty');
    return data;
  } catch (e) {
    console.error('TFR Guardian: Error fetching accounts:', e);
    return null;
  }
}

// Fetch account details from API
async function fetchAccountDetailsFromAPI() {
  const accountId = tradingData.accountId || extractAccountIdFromUrl();
  if (!accountId) return null;
  
  try {
    const response = await fetch(`${API_BASE_URL}/trading-accounts/${accountId}`, {
      method: 'GET',
      headers: {
        'accept': 'application/json, text/plain, */*',
        'content-type': 'application/json'
      },
      credentials: 'include'
    });
    
    if (!response.ok) return null;
    
    const data = await response.json();
    console.log('TFR Guardian: Fetched account details:', data);
    console.log('TFR Guardian: RAW account details =', JSON.stringify(data));
    return data;
  } catch (e) {
    console.error('TFR Guardian: Error fetching account:', e);
    return null;
  }
}

// Fetch positions from API (includes unrealized PnL)
async function fetchPositionsFromAPI() {
  const accountId = tradingData.accountId || extractAccountIdFromUrl();
  if (!accountId) return null;
  
  try {
    const response = await fetch(`${API_BASE_URL}/trading-accounts/${accountId}/positions`, {
      method: 'GET',
      headers: { 'accept': 'application/json, text/plain, */*' },
      credentials: 'include'
    });
    if (!response.ok) return null;
    const data = await response.json();
    console.log('TFR Guardian: Fetched positions:', data);
    if (Array.isArray(data) && data.length > 0) {
      console.log('TFR Guardian: RAW first position =', JSON.stringify(data[0]));
    }
    return data;
  } catch (e) {
    console.error('TFR Guardian: Error fetching positions:', e);
    return null;
  }
}

// Fetch trade history from API (closed positions with PnL)
async function fetchTradesFromAPI() {
  const accountId = tradingData.accountId || extractAccountIdFromUrl();
  if (!accountId) return null;
  
  // Try known endpoints for closed trades
  const endpoints = [
    `${API_BASE_URL}/trading-accounts/${accountId}/trades`,
    `${API_BASE_URL}/trading-accounts/${accountId}/closed-positions`,
    `${API_BASE_URL}/trading-accounts/${accountId}/positions?status=closed`,
    `${API_BASE_URL}/positions?account_id=${accountId}&status=closed`,
    `${API_BASE_URL}/trades?account_id=${accountId}`
  ];
  
  for (const url of endpoints) {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'accept': 'application/json, text/plain, */*' },
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data) && data.length > 0) {
          console.log('TFR Guardian: Found trades at:', url);
          console.log('TFR Guardian: RAW first trade =', JSON.stringify(data[0]));
          return data;
        }
      }
    } catch (e) { /* try next */ }
  }
  console.log('TFR Guardian: No trades endpoint found, will compute from orders');
  return null;
}

// Contract sizes per symbol for PnL calculation
const CONTRACT_SIZES = {
  'XAU/USD': 100,
  'XAG/USD': 5000,
  'BTC/USD': 1,
  'ETH/USD': 1,
  'default': 100000 // forex pairs
};

function getContractSize(symbol) {
  if (!symbol) return 100000;
  const upper = symbol.toUpperCase();
  for (const [key, size] of Object.entries(CONTRACT_SIZES)) {
    if (upper.includes(key.replace('/', ''))) return size;
  }
  return CONTRACT_SIZES[upper] || CONTRACT_SIZES['default'];
}

// Process API data into trading data format
// Orders come as filled buy/sell pairs — match them to compute PnL
function processAPIData(apiData) {
  if (!apiData || !Array.isArray(apiData)) {
    console.log('TFR Guardian: API data is not an array:', apiData);
    return;
  }
  
  tradingData.openOrders = [];
  tradingData.tradeHistory = [];
  
  // Filter by status
  const openOrders = apiData.filter(o => {
    const s = String(o.status || '').toLowerCase();
    return s === 'open' || s === 'pending' || s === 'new' || s === 'active';
  });
  const filledOrders = apiData.filter(o => {
    const s = String(o.status || '').toLowerCase();
    return s === 'filled' || s === 'closed' || s === 'completed';
  });
  
  // Open orders
  tradingData.openOrders = openOrders.map(o => ({
    id: o.order_id || o.id,
    symbol: o.trading_pair || o.symbol,
    side: o.side?.toUpperCase(),
    type: o.order_type,
    size: o.quantity,
    entryPrice: o.price,
    openTime: o.created_at,
    status: o.status,
    leverage: o.leverage,
    takeProfit: o.take_profit_price,
    stopLoss: o.stop_loss_price
  }));
  
  // Record filled orders for HFT tracking (only when orders are actually confirmed)
  // Use the order's actual creation time from API, not current time
  filledOrders.forEach(o => {
    const symbol = o.trading_pair || o.symbol || 'UNKNOWN';
    const side = (o.side || 'BUY').toUpperCase();
    const orderId = o.order_id || o.id;
    
    // Parse the order's actual creation time from API
    const createdAt = o.created_at || o.filled_at || o.timestamp;
    let orderTime = Date.now();
    if (createdAt) {
      const utcStr = createdAt.endsWith('Z') ? createdAt : createdAt + 'Z';
      orderTime = new Date(utcStr).getTime();
    }
    
    recordOrderWithTimestamp(symbol, side, orderId, orderTime);
  });
  
  // Pair filled orders by symbol and matching quantity to compute PnL
  // Group by symbol
  const bySymbol = {};
  filledOrders.forEach(o => {
    const sym = o.trading_pair || o.symbol || 'UNKNOWN';
    if (!bySymbol[sym]) bySymbol[sym] = { buys: [], sells: [] };
    if (o.side?.toLowerCase() === 'buy') bySymbol[sym].buys.push(o);
    else bySymbol[sym].sells.push(o);
  });
  
  const pairedTrades = [];
  Object.entries(bySymbol).forEach(([symbol, { buys, sells }]) => {
    // Sort both by time ascending
    buys.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    sells.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    
    // Use a queue-based approach:
    // Interleave all orders by time, then match consecutive opposite-side orders
    const all = [
      ...buys.map(o => ({ ...o, _side: 'buy' })),
      ...sells.map(o => ({ ...o, _side: 'sell' }))
    ].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    
    // Stack of open legs: { side, order }
    const openLegs = [];
    
    all.forEach(order => {
      const side = order._side;
      // Find the oldest open leg of the OPPOSITE side (closing trade)
      const idx = openLegs.findIndex(leg =>
        leg.side !== side &&
        Math.abs(leg.order.quantity - order.quantity) / Math.max(leg.order.quantity, order.quantity) < 0.02
      );
      
      if (idx !== -1) {
        // Found a match — this order CLOSES the open leg
        const openLeg = openLegs.splice(idx, 1)[0];
        let entryOrder, exitOrder, tradeSide;
        if (openLeg.side === 'buy') {
          // LONG: opened with buy, closed with sell
          entryOrder = openLeg.order;
          exitOrder = order;
          tradeSide = 'LONG';
        } else {
          // SHORT: opened with sell, closed with buy
          entryOrder = openLeg.order;
          exitOrder = order;
          tradeSide = 'SHORT';
        }
        const priceDiff = tradeSide === 'LONG'
          ? exitOrder.price - entryOrder.price
          : entryOrder.price - exitOrder.price;
        const pnl = priceDiff * entryOrder.quantity;
        pairedTrades.push({
          id: entryOrder.order_id,
          symbol,
          side: tradeSide,
          size: entryOrder.quantity,
          entryPrice: entryOrder.price,
          exitPrice: exitOrder.price,
          pnl: parseFloat(pnl.toFixed(2)),
          openTime: entryOrder.created_at,
          closeTime: exitOrder.created_at
        });
      } else {
        // No matching opposite — this is an open leg
        openLegs.push({ side, order });
      }
    });
    
    // Remaining openLegs are truly open positions
    openLegs.forEach(leg => {
      pairedTrades.push({
        id: leg.order.order_id,
        symbol,
        side: leg.side === 'buy' ? 'LONG' : 'SHORT',
        size: leg.order.quantity,
        entryPrice: leg.order.price,
        exitPrice: null,
        pnl: null,
        openTime: leg.order.created_at,
        closeTime: null
      });
    });
  });
  
  // Sort by time descending (newest first), only keep CLOSED trades (have exitPrice)
  const closedTrades = pairedTrades.filter(t => t.exitPrice !== null);
  closedTrades.sort((a, b) => new Date(b.closeTime) - new Date(a.closeTime));
  tradingData.tradeHistory = closedTrades;
  
  // Open positions = unmatched orders
  const openPositions = pairedTrades.filter(t => t.exitPrice === null);
  if (openPositions.length > 0) {
    tradingData.openPositions = openPositions;
    // Check for new positions to show min trade time notification
    checkForNewPositions(openPositions);
    // Check max risk per trade (3% limit in funded stage)
    checkMaxRiskPerTrade(openPositions, tradingData.accountSize, tradingData.currentStage);
  } else {
    // No open positions from order pairing
    tradingData.openPositions = [];
  }
  
  console.log('TFR Guardian: Processed', tradingData.openOrders.length, 'open orders,', openPositions.length, 'open positions,', closedTrades.length, 'closed trades from', apiData.length, 'total orders');
  
  // Compute today's total realized PnL
  const today = new Date();
  today.setUTCHours(2, 0, 0, 0);
  let todayPnl = 0;
  pairedTrades.forEach(t => {
    if (t.pnl !== null && t.closeTime && new Date(t.closeTime) >= today) {
      todayPnl += t.pnl;
    }
  });
  tradingData.todayRealizedPnl = parseFloat(todayPnl.toFixed(2));
  console.log('TFR Guardian: Today realized PnL:', tradingData.todayRealizedPnl);
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}

async function initialize() {
  console.log('TheFundedRoom Rules Guardian: Content script loaded');
  
  // Notify background script that we're on the platform
  try {
    chrome.runtime.sendMessage({ type: 'PLATFORM_DETECTED' });
  } catch (e) {
    console.log('TFR Guardian: Could not notify background script');
  }
  
  // Detect account information
  detectAccountInfo();
  
  // Load daily start balance from storage
  await loadDailyStartBalance();
  
  // Start monitoring
  startMonitoring();
  
  // Create warning overlay
  createWarningOverlay();
  
  // Listen for messages from popup
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'GET_TRADING_DATA') {
      sendResponse({ data: tradingData });
    } else if (message.type === 'REFRESH_ACCOUNT_INFO') {
      detectAccountInfo();
      sendResponse({ success: true });
    } else if (message.action === 'refreshData') {
      // Force refresh all data
      console.log('TFR Guardian: Refreshing all trading data...');
      extractAllTradingData();
      sendResponse({ success: true });
    }
    return true;
  });
}

// Detect account type, size, and stage from page content
function detectAccountInfo() {
  const pageText = document.body.innerText.toLowerCase();
  const pageHTML = document.body.innerHTML.toLowerCase();
  
  // Detect account type
  for (const [type, patterns] of Object.entries(ACCOUNT_TYPE_PATTERNS)) {
    for (const pattern of patterns) {
      if (pageText.includes(pattern) || pageHTML.includes(pattern)) {
        tradingData.accountType = type;
        break;
      }
    }
    if (tradingData.accountType) break;
  }
  
  // Detect stage
  for (const [stage, patterns] of Object.entries(STAGE_PATTERNS)) {
    for (const pattern of patterns) {
      if (pageText.includes(pattern) || pageHTML.includes(pattern)) {
        tradingData.currentStage = stage === 'stage2' ? 'stage2' : stage;
        break;
      }
    }
    if (tradingData.currentStage) break;
  }
  
  // Detect account size
  const accountSizePatterns = [
    /\$([\d,]+)\s*(?:account|balance|size)/i,
    /account\s*size[:\s]*\$?([\d,]+)/i,
    /balance[:\s]*\$?([\d,]+)/i,
    /(\d{1,3}(?:,\d{3})+)\s*(?:usd|\$)/i
  ];
  
  for (const pattern of accountSizePatterns) {
    const match = pageText.match(pattern) || pageHTML.match(pattern);
    if (match) {
      const size = parseInt(match[1].replace(/,/g, ''));
      if (size >= 1000 && size <= 1000000) {
        tradingData.accountSize = size;
        break;
      }
    }
  }
  
  // Try to find equity/balance from dashboard elements
  detectEquityFromDOM();
  
  // Initialize rules engine if we have account info
  if (tradingData.accountType && tradingData.accountSize) {
    initializeRulesEngine();
  }
  
  console.log('Detected account info:', tradingData);
}

// Get daily start time (2 AM UTC per TheFundedRoom rules)
function getDailyStartTime() {
  const now = new Date();
  const utc = new Date(now.getTime() + now.getTimezoneOffset() * 60000);
  const startTime = new Date(utc);
  startTime.setUTCHours(2, 0, 0, 0);
  if (utc < startTime) {
    startTime.setUTCDate(startTime.getUTCDate() - 1);
  }
  return startTime.getTime();
}

// Load saved daily start balance from storage
async function loadDailyStartBalance() {
  try {
    const result = await chrome.storage.local.get(['dailyStartBalance', 'dailyStartTime', 'dailyHighBalance']);
    const currentDailyStart = getDailyStartTime();
    
    // If we have a saved balance and it's from today (after 2 AM UTC), use it
    if (result.dailyStartBalance && result.dailyStartTime) {
      if (result.dailyStartTime >= currentDailyStart) {
        tradingData.dailyStartBalance = result.dailyStartBalance;
        tradingData.dailyHighBalance = result.dailyHighBalance || result.dailyStartBalance;
        console.log('TFR Guardian: Loaded daily start balance:', tradingData.dailyStartBalance, 'daily high:', tradingData.dailyHighBalance);
        return;
      }
    }
    
    // Otherwise, use account size as initial daily start balance
    if (tradingData.accountSize) {
      tradingData.dailyStartBalance = tradingData.accountSize;
      tradingData.dailyHighBalance = tradingData.accountSize;
      await saveDailyStartBalance(tradingData.accountSize);
      console.log('TFR Guardian: Set daily start balance to account size:', tradingData.dailyStartBalance);
    }
  } catch (e) {
    console.error('TFR Guardian: Error loading daily start balance:', e);
    // Fallback to account size
    if (tradingData.accountSize) {
      tradingData.dailyStartBalance = tradingData.accountSize;
      tradingData.dailyHighBalance = tradingData.accountSize;
    }
  }
}

// Update daily high if equity exceeds previous high
async function updateDailyHigh(currentEquity) {
  if (!tradingData.dailyHighBalance) {
    tradingData.dailyHighBalance = tradingData.dailyStartBalance || tradingData.accountSize || currentEquity;
  }
  
  // If current equity is higher than daily high, update it
  if (currentEquity > tradingData.dailyHighBalance) {
    console.log('TFR Guardian: New daily high:', currentEquity, 'previous:', tradingData.dailyHighBalance);
    tradingData.dailyHighBalance = currentEquity;
    try {
      await chrome.storage.local.set({ dailyHighBalance: tradingData.dailyHighBalance });
    } catch (e) {
      console.error('TFR Guardian: Error saving daily high:', e);
    }
  }
}

// Save daily start balance to storage
async function saveDailyStartBalance(balance) {
  try {
    await chrome.storage.local.set({
      dailyStartBalance: balance,
      dailyStartTime: getDailyStartTime(),
      dailyHighBalance: balance
    });
  } catch (e) {
    console.error('TFR Guardian: Error saving daily start balance:', e);
  }
}

// Detect equity/balance from DOM elements
function detectEquityFromDOM() {
  // Get all text content from the page
  const pageText = document.body.innerText;
  
  // Try to find equity with various patterns
  const equityPatterns = [
    /equity[:\s]*\$?([\d,]+\.?\d*)/i,
    /current\s+equity[:\s]*\$?([\d,]+\.?\d*)/i,
    /account\s+equity[:\s]*\$?([\d,]+\.?\d*)/i,
    /balance[:\s]*\$?([\d,]+\.?\d*)/i,
    /current\s+balance[:\s]*\$?([\d,]+\.?\d*)/i,
    /account\s+balance[:\s]*\$?([\d,]+\.?\d*)/i,
    /\$([\d,]+\.?\d*)\s*(?:equity|balance)/i,
    /(?:equity|balance)\s*\n?\s*\$?([\d,]+\.?\d*)/i
  ];
  
  for (const pattern of equityPatterns) {
    const match = pageText.match(pattern);
    if (match) {
      const value = parseFloat(match[1].replace(/,/g, ''));
      if (value > 0) {
        tradingData.currentEquity = value;
        break;
      }
    }
  }
  
  // Also try to find via DOM selectors - broader search
  const allElements = document.querySelectorAll('*');
  for (const el of allElements) {
    const text = el.innerText || el.textContent || '';
    const textLower = text.toLowerCase();
    
    // Check if element contains equity/balance label
    if ((textLower.includes('equity') || textLower.includes('balance')) && 
        !textLower.includes('daily') && 
        !textLower.includes('limit')) {
      
      // Look for currency value in this element or its children
      const value = parseCurrency(text);
      if (value !== null && value > 100) { // Reasonable account size
        if (textLower.includes('equity')) {
          tradingData.currentEquity = value;
        } else if (textLower.includes('balance')) {
          tradingData.balance = value;
        }
      }
    }
  }
  
  // Try to find any large dollar amounts that could be equity
  if (!tradingData.currentEquity) {
    const dollarPattern = /\$([\d,]+\.?\d{0,2})/g;
    let match;
    while ((match = dollarPattern.exec(pageText)) !== null) {
      const value = parseFloat(match[1].replace(/,/g, ''));
      // Look for values that look like account equity (between 1k and 1M)
      if (value >= 1000 && value <= 1000000) {
        // Check surrounding context
        const start = Math.max(0, match.index - 50);
        const end = Math.min(pageText.length, match.index + 50);
        const context = pageText.substring(start, end).toLowerCase();
        
        if (context.includes('equity') || context.includes('balance') || 
            context.includes('account') || context.includes('current')) {
          tradingData.currentEquity = value;
          break;
        }
      }
    }
  }
  
  // Debug logging
  if (tradingData.currentEquity) {
    console.log('TFR Guardian: Detected equity =', tradingData.currentEquity, 'Daily start:', tradingData.dailyStartBalance);
    // Update daily high if equity is higher
    updateDailyHigh(tradingData.currentEquity);
  }
}

// Parse currency string to number
function parseCurrency(text) {
  if (!text) return null;
  
  // Try various currency formats
  const patterns = [
    /[\$€£]\s*([\d,]+\.?\d*)/,           // $1,234.56
    /([\d,]+\.?\d*)\s*[\$€£]/,           // 1,234.56 $
    /\b([\d,]+\.\d{2})\b/,               // 1,234.56 (no symbol)
    /\b([\d,]+)\b/                       // 1,234 (no decimals)
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const value = parseFloat(match[1].replace(/,/g, ''));
      if (!isNaN(value) && value > 0) {
        return value;
      }
    }
  }
  
  return null;
}

// Initialize rules engine
function initializeRulesEngine() {
  // Ensure we have a daily start balance
  if (!tradingData.dailyStartBalance && tradingData.accountSize) {
    tradingData.dailyStartBalance = tradingData.accountSize;
    saveDailyStartBalance(tradingData.accountSize);
  }
  
  // Since we can't easily import, we'll create a simplified version
  tradingData.rulesEngine = {
    accountType: tradingData.accountType,
    accountSize: tradingData.accountSize,
    currentStage: tradingData.currentStage,
    dailyStartBalance: tradingData.dailyStartBalance || tradingData.accountSize,
    
    getRules() {
      const rules = {
        instant_funding: {
          dailyLossLimit: 0.03,
          maxTotalLoss: 0.06,
          consistencyCap: 0.15
        },
        one_step: {
          evaluation: { dailyLossLimit: 0.03, maxTotalLoss: 0.06, profitTarget: 0.10 },
          funded: { dailyLossLimit: 0.03, maxTotalLoss: 0.06 }
        },
        two_step: {
          stage1: { dailyLossLimit: 0.05, maxTotalLoss: 0.10, profitTarget: 0.08 },
          stage2: { dailyLossLimit: 0.05, maxTotalLoss: 0.10, profitTarget: 0.05 },
          funded: { dailyLossLimit: 0.05, maxTotalLoss: 0.10, maxRiskPerTrade: 0.03 }
        }
      };
      return rules[this.accountType];
    },
    
    checkAllRules(data) {
      const violations = [];
      const rules = this.getRules();
      const currentRules = this.currentStage && rules[this.currentStage] ? rules[this.currentStage] : rules;
      
      if (!currentRules) return violations;
      
      // Check daily loss limit (from daily high, not start balance)
      if (data.currentEquity && this.dailyHighBalance) {
        const dailyLoss = this.dailyHighBalance - data.currentEquity;
        const dailyLossPct = dailyLoss / this.dailyHighBalance;
        
        if (dailyLossPct >= currentRules.dailyLossLimit) {
          violations.push({
            rule: 'Daily Loss Limit',
            severity: 'critical',
            message: `DAILY LOSS LIMIT BREACHED! Loss: ${(dailyLossPct * 100).toFixed(2)}% (Limit: ${(currentRules.dailyLossLimit * 100).toFixed(0)}%)`,
            current: dailyLossPct,
            limit: currentRules.dailyLossLimit
          });
        } else if (dailyLossPct >= currentRules.dailyLossLimit * 0.8) {
          violations.push({
            rule: 'Daily Loss Limit',
            severity: 'warning',
            message: `WARNING: Daily loss at ${(dailyLossPct * 100).toFixed(2)}% (Limit: ${(currentRules.dailyLossLimit * 100).toFixed(0)}%)`,
            current: dailyLossPct,
            limit: currentRules.dailyLossLimit
          });
        }
      }
      
      // Check max total loss
      if (data.currentEquity && this.accountSize) {
        const totalLoss = this.accountSize - data.currentEquity;
        const totalLossPct = totalLoss / this.accountSize;
        
        if (totalLossPct >= currentRules.maxTotalLoss) {
          violations.push({
            rule: 'Max Total Loss',
            severity: 'critical',
            message: `MAX TOTAL LOSS BREACHED! Drawdown: ${(totalLossPct * 100).toFixed(2)}% (Limit: ${(currentRules.maxTotalLoss * 100).toFixed(0)}%)`,
            current: totalLossPct,
            limit: currentRules.maxTotalLoss
          });
        } else if (totalLossPct >= currentRules.maxTotalLoss * 0.8) {
          violations.push({
            rule: 'Max Total Loss',
            severity: 'warning',
            message: `WARNING: Total drawdown at ${(totalLossPct * 100).toFixed(2)}% (Limit: ${(currentRules.maxTotalLoss * 100).toFixed(0)}%)`,
            current: totalLossPct,
            limit: currentRules.maxTotalLoss
          });
        }
      }
      
      // Check profit target
      if (currentRules.profitTarget && data.currentEquity && this.accountSize) {
        const profit = data.currentEquity - this.accountSize;
        const profitPct = profit / this.accountSize;
        const targetPct = currentRules.profitTarget;
        
        if (profitPct >= targetPct) {
          violations.push({
            rule: 'Profit Target',
            severity: 'info',
            message: `🎉 PROFIT TARGET REACHED! ${(profitPct * 100).toFixed(2)}% (Target: ${(targetPct * 100).toFixed(0)}%)`,
            current: profitPct,
            target: targetPct
          });
        } else if (profitPct >= targetPct * 0.5) {
          violations.push({
            rule: 'Profit Target',
            severity: 'info',
            message: `Progress: ${(profitPct * 100).toFixed(2)}% of ${(targetPct * 100).toFixed(0)}% target`,
            current: profitPct,
            target: targetPct
          });
        }
      }
      
      return violations.sort((a, b) => {
        const order = { critical: 0, warning: 1, info: 2 };
        return order[a.severity] - order[b.severity];
      });
    }
  };
}

// Start monitoring trading activity
function startMonitoring() {
  // Monitor for changes in balance/equity
  const observer = new MutationObserver(async (mutations) => {
    if (!isExtensionContextValid()) {
      observer.disconnect();
      return;
    }
    detectEquityFromDOM();
    checkRules();
    await sendUpdateToBackground();
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });
  
  // Immediate first check
  detectEquityFromDOM();
  sendUpdateToBackground();
  
  // Periodic check every 2 seconds for more responsive updates
  const intervalId = setInterval(async () => {
    if (!isExtensionContextValid()) {
      clearInterval(intervalId);
      console.log('TFR Guardian: Stopped monitoring due to invalid context');
      return;
    }
    detectEquityFromDOM();
    checkRules();
    await sendUpdateToBackground();
  }, 2000);
  
  // Monitor for trade buttons/actions
  monitorTradeActions();
}

// Monitor trade-related actions
function monitorTradeActions() {
  // Listen for click events on trade buttons - only for rule checking, NOT for HFT tracking
  // HFT tracking happens via API data when orders are actually confirmed
  document.addEventListener('click', (e) => {
    const target = e.target;
    const buttonText = (target.innerText || target.textContent || '').toLowerCase();
    
    // Detect buy/sell buttons
    const isBuy = buttonText.includes('buy') || buttonText.includes('long') || target.className.toLowerCase().includes('buy');
    const isSell = buttonText.includes('sell') || buttonText.includes('short') || target.className.toLowerCase().includes('sell');
    
    if (isBuy || isSell) {
      // Detect symbol from page for HFT pre-check warning only
      const symbol = detectCurrentSymbol() || 'UNKNOWN';
      const side = isBuy ? 'BUY' : 'SELL';
      
      // Check HFT status BEFORE allowing trade - show warning but don't record yet
      const hftStatus = checkHFTBeforeTrade(symbol, side);
      if (hftStatus.isOverLimit) {
        e.preventDefault();
        e.stopPropagation();
        console.log('TFR Guardian: HFT limit reached - blocking trade');
        // Show critical warning
        updateHFTWarning(symbol, side, [{timestamp: Date.now()}, {timestamp: Date.now()}, {timestamp: Date.now()}]);
        return false;
      }
      
      // Show warning if at limit (2 orders already) - but don't record until order is confirmed
      if (hftStatus.isAtLimit) {
        updateHFTWarning(symbol, side, [{timestamp: Date.now()}, {timestamp: Date.now()}]);
      }
      
      // Check rules before allowing trade
      const violations = tradingData.rulesEngine ? tradingData.rulesEngine.checkAllRules(tradingData) : [];
      const criticalViolations = violations.filter(v => v.severity === 'critical');
      
      if (criticalViolations.length > 0) {
        showWarningOverlay(criticalViolations);
      }
      
      // NOTE: We do NOT record the order here - we wait for API confirmation
      // The order will be recorded when fetchOrdersFromAPI() returns new filled orders
    }
  }, true);
}

// Detect current trading symbol from page
function detectCurrentSymbol() {
  // Try to find symbol in common places
  const selectors = [
    '[data-symbol]',
    '.symbol',
    '.pair',
    '.trading-pair',
    '[class*="symbol"]',
    '[class*="pair"]'
  ];
  
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el) {
      const text = el.textContent || el.dataset.symbol || '';
      if (text.match(/XAU|USD|EUR|GBP|BTC|ETH|JPY/i)) {
        return text.trim().toUpperCase();
      }
    }
  }
  
  // Try to extract from URL or page title
  const pageText = document.body.innerText;
  const match = pageText.match(/(XAU\/USD|BTC\/USD|ETH\/USD|EUR\/USD|GBP\/USD|USD\/JPY)/i);
  if (match) return match[1].toUpperCase();
  
  return null;
}

// Check rules and display warnings
function checkRules() {
  if (!tradingData.rulesEngine) return;
  
  const violations = tradingData.rulesEngine.checkAllRules(tradingData);
  
  if (violations.length > 0) {
    const criticalViolations = violations.filter(v => v.severity === 'critical');
    const warningViolations = violations.filter(v => v.severity === 'warning');
    
    if (criticalViolations.length > 0) {
      showWarningOverlay(criticalViolations);
    }
    
    // Send violations to background
    if (isExtensionContextValid()) {
      violations.forEach(v => {
        try {
          chrome.runtime.sendMessage({
            type: 'VIOLATION_DETECTED',
            violation: v
          });
        } catch (e) {
          // Extension context may be invalidated
        }
      });
    }
  }
}

// Extract data from all trading sections
async function extractAllTradingData() {
  try {
    // If no account ID in URL, try to fetch all accounts and find the active one
    if (!tradingData.accountId && !extractAccountIdFromUrl()) {
      const allAccounts = await fetchAllTradingAccounts();
      if (allAccounts && Array.isArray(allAccounts) && allAccounts.length > 0) {
        // Find the active account or use the first one
        const activeAccount = allAccounts.find(acc => acc.status === 'ACTIVE') || allAccounts[0];
        if (activeAccount) {
          // API uses account_id field (not id)
          const accId = activeAccount.account_id || activeAccount.id;
          if (accId) {
            tradingData.accountId = String(accId);
            console.log('TFR Guardian: Found active account:', tradingData.accountId);
          }
        }
      }
    }
    
    // Try to fetch from API first
    const [apiOrders, apiPositions, apiTrades] = await Promise.all([
      fetchOrdersFromAPI(),
      fetchPositionsFromAPI(),
      fetchTradesFromAPI()
    ]);
    
    if (apiOrders) {
      processAPIData(apiOrders);
    } else {
      // Fallback to HTML parsing
      tradingData.openPositions = extractPositions();
      tradingData.openOrders = extractOpenOrders();
      tradingData.tradeHistory = extractTradeHistory();
      tradingData.orderHistory = extractOrderHistory();
    }
    
    // Process open positions (with unrealized PnL)
    if (apiPositions && Array.isArray(apiPositions)) {
      const mappedPositions = apiPositions.map(p => ({
        id: p.position_id || p.id,
        symbol: p.trading_pair || p.symbol,
        side: (p.side || p.position_side)?.toUpperCase(),
        size: p.quantity || p.size || p.volume,
        entryPrice: p.entry_price || p.average_entry_price || p.price,
        currentPrice: p.current_price || p.mark_price,
        pnl: p.unrealized_pnl || p.pnl || p.profit,
        openTime: p.opened_at || p.created_at
      })).filter(p => {
        // Only keep valid positions with required fields
        const isValid = p.symbol && p.side && p.size && p.entryPrice;
        if (!isValid) {
          console.log('TFR Guardian: Filtering out invalid position:', p);
        }
        return isValid;
      });
      
      // Only use API positions if we have valid data, otherwise keep order-derived positions
      if (mappedPositions.length > 0) {
        tradingData.openPositions = mappedPositions;
        // Check for new positions to show min trade time notification
        checkForNewPositions(mappedPositions);
        // Check max risk per trade (3% limit in funded stage)
        checkMaxRiskPerTrade(mappedPositions, tradingData.accountSize, tradingData.currentStage);
        console.log('TFR Guardian: Processed', tradingData.openPositions.length, 'valid open positions from API');
      } else if (apiPositions.length === 0) {
        // API explicitly returned empty positions = no open positions
        tradingData.openPositions = [];
        console.log('TFR Guardian: API returned no open positions');
      }
    }
    
    // Process closed trades with PnL
    if (apiTrades && Array.isArray(apiTrades) && apiTrades.length > 0) {
      tradingData.tradeHistory = apiTrades.map(t => ({
        id: t.position_id || t.trade_id || t.id,
        symbol: t.trading_pair || t.symbol,
        side: (t.side || t.direction)?.toUpperCase(),
        size: t.quantity || t.size,
        entryPrice: t.entry_price || t.average_entry_price,
        exitPrice: t.exit_price || t.close_price || t.average_exit_price,
        pnl: t.realized_pnl || t.pnl || t.profit || t.net_profit,
        openTime: t.opened_at || t.created_at,
        closeTime: t.closed_at || t.updated_at
      }));
      console.log('TFR Guardian: Processed', tradingData.tradeHistory.length, 'closed trades with PnL');
    }
    
    // Also try to fetch account details from API
    const accountDetails = await fetchAccountDetailsFromAPI();
    if (accountDetails) {
      // Map correct API field names
      // current_balance = running balance, initial_capital = account size
      if (accountDetails.current_balance) tradingData.balance = parseFloat(accountDetails.current_balance);
      if (accountDetails.initial_capital) {
        tradingData.accountSize = parseFloat(accountDetails.initial_capital);
        // Set daily start balance if not already set
        if (!tradingData.dailyStartBalance) {
          tradingData.dailyStartBalance = tradingData.accountSize;
          await saveDailyStartBalance(tradingData.accountSize);
          console.log('TFR Guardian: Set daily start balance to initial_capital:', tradingData.accountSize);
        }
      }
      // Map stage from API  
      if (accountDetails.stage) {
        tradingData.currentStage = accountDetails.stage.toLowerCase();
      }
      // Map account type from challenge name
      if (accountDetails.challenges && accountDetails.challenges.name) {
        const challengeName = accountDetails.challenges.name.toLowerCase();
        if (challengeName.includes('instant') || challengeName.includes('direct')) {
          tradingData.accountType = 'instant_funding';
        } else if (challengeName.includes('one') || challengeName.includes('1-step') || challengeName.includes('1step')) {
          tradingData.accountType = 'one_step';
        } else {
          // Starter, Two-step, etc.
          tradingData.accountType = 'two_step';
        }
        console.log('TFR Guardian: Mapped account type:', tradingData.accountType, 'from challenge:', challengeName);
      }
      // Store challenge rules for dynamic rule checking
      if (accountDetails.challenges) {
        tradingData.challengeRules = {
          maxDailyLoss: accountDetails.challenges.max_daily_loss,
          maxTotalLoss: accountDetails.challenges.max_total_loss_step1 || accountDetails.challenges.max_total_loss_step2,
          step1ProfitTarget: accountDetails.challenges.step1_profit_target,
          step2ProfitTarget: accountDetails.challenges.step2_profit_target,
          minTradingDays: accountDetails.challenges.min_trading_days
        };
        console.log('TFR Guardian: Challenge rules:', tradingData.challengeRules);
      }
      // unrealized_pnl from API
      if (accountDetails.unrealized_pnl !== undefined) {
        tradingData.unrealizedPnl = parseFloat(accountDetails.unrealized_pnl);
        // Equity = balance + unrealized PnL
        tradingData.currentEquity = tradingData.balance + tradingData.unrealizedPnl;
        console.log('TFR Guardian: Computed equity:', tradingData.currentEquity, '(balance:', tradingData.balance, '+ unrealized:', tradingData.unrealizedPnl, ')');
      }
    }
    
    // Extract account metrics from HTML as fallback
    extractAccountMetrics();
    
    console.log('TFR Guardian: Extracted data:', {
      accountId: tradingData.accountId,
      positions: tradingData.openPositions.length,
      openOrders: tradingData.openOrders.length,
      tradeHistory: tradingData.tradeHistory.length,
      orderHistory: tradingData.orderHistory.length,
      equity: tradingData.currentEquity,
      balance: tradingData.balance,
      dailyLoss: tradingData.dailyLoss,
      totalLoss: tradingData.totalLoss
    });
  } catch (e) {
    console.error('TFR Guardian: Error extracting trading data:', e);
  }
}

// Extract Positions data
function extractPositions() {
  const positions = [];
  const pageText = document.body.innerText;
  
  // Look for position table rows or cards
  const positionPatterns = [
    /(\w+)\s+(BUY|SELL|Long|Short)\s+([\d.]+)\s+.*?(?:\$)?([\d,.]+)/gi,
    /(BUY|SELL)\s+(\w+)\s+@?\s*([\d.]+)/gi
  ];
  
  // Try to find position elements by looking for common patterns
  const allElements = document.querySelectorAll('tr, div[class*="position"], div[class*="trade"], [class*="row"]');
  
  for (const el of allElements) {
    const text = el.innerText || '';
    if (text.match(/(BUY|SELL|Long|Short)/i) && text.match(/\$?[\d,.]+/)) {
      const position = parsePositionFromText(text);
      if (position && !positions.find(p => p.symbol === position.symbol && p.side === position.side)) {
        positions.push(position);
      }
    }
  }
  
  return positions;
}

// Parse position from text
function parsePositionFromText(text) {
  const lines = text.split('\n').filter(l => l.trim());
  
  // Look for symbol (usually uppercase letters)
  const symbolMatch = text.match(/\b([A-Z]{2,10})\b/);
  const symbol = symbolMatch ? symbolMatch[1] : null;
  
  // Look for side (BUY/SELL/Long/Short)
  const sideMatch = text.match(/(BUY|SELL|Long|Short)/i);
  const side = sideMatch ? sideMatch[1].toUpperCase() : null;
  
  // Look for size/lots
  const sizeMatch = text.match(/([\d.]+)\s*(?:lots?|units?|shares?)?/i);
  const size = sizeMatch ? parseFloat(sizeMatch[1]) : null;
  
  // Look for entry price
  const entryMatch = text.match(/(?:entry|open|@)\s*[:\s]*\$?([\d.,]+)/i);
  const entryPrice = entryMatch ? parseFloat(entryMatch[1].replace(/,/g, '')) : null;
  
  // Look for current price
  const currentMatch = text.match(/(?:current|market|price)\s*[:\s]*\$?([\d.,]+)/i);
  const currentPrice = currentMatch ? parseFloat(currentMatch[1].replace(/,/g, '')) : null;
  
  // Look for P&L
  const pnlMatch = text.match(/(?:P&L|profit|loss|pnl)\s*[:\s]*\$?([\d.,-]+)/i);
  const pnl = pnlMatch ? parseFloat(pnlMatch[1].replace(/,/g, '')) : null;
  
  if (symbol && side) {
    return { symbol, side, size, entryPrice, currentPrice, pnl, rawText: text.substring(0, 100) };
  }
  return null;
}

// Extract Open Orders
function extractOpenOrders() {
  const orders = [];
  const allElements = document.querySelectorAll('tr, div[class*="order"], [class*="pending"]');
  
  for (const el of allElements) {
    const text = el.innerText || '';
    if (text.match(/(pending|open|limit|stop)/i) && text.match(/(BUY|SELL)/i)) {
      const order = parseOrderFromText(text);
      if (order && !orders.find(o => o.symbol === order.symbol && o.type === order.type)) {
        orders.push(order);
      }
    }
  }
  
  return orders;
}

// Parse order from text
function parseOrderFromText(text) {
  const symbolMatch = text.match(/\b([A-Z]{2,10})\b/);
  const symbol = symbolMatch ? symbolMatch[1] : null;
  
  const sideMatch = text.match(/(BUY|SELL)/i);
  const side = sideMatch ? sideMatch[1].toUpperCase() : null;
  
  const typeMatch = text.match(/(Limit|Stop|Market|Stop Loss|Take Profit)/i);
  const type = typeMatch ? typeMatch[1] : 'Unknown';
  
  const priceMatch = text.match(/(?:price|@)\s*[:\s]*\$?([\d.,]+)/i);
  const price = priceMatch ? parseFloat(priceMatch[1].replace(/,/g, '')) : null;
  
  const sizeMatch = text.match(/([\d.]+)\s*(?:lots?|units?)?/i);
  const size = sizeMatch ? parseFloat(sizeMatch[1]) : null;
  
  if (symbol && side) {
    return { symbol, side, type, price, size, rawText: text.substring(0, 100) };
  }
  return null;
}

// Extract Trade History
function extractTradeHistory() {
  const trades = [];
  
  // Try to find the trade history table
  const table = document.querySelector('.trade-history-container table, .portfolio-section table');
  if (table) {
    const rows = table.querySelectorAll('tbody tr');
    for (const row of rows) {
      const trade = parseTradeRow(row);
      if (trade) {
        trades.push(trade);
      }
    }
  }
  
  // Fallback to generic search if table not found
  if (trades.length === 0) {
    const allElements = document.querySelectorAll('tr, div[class*="history"], div[class*="trade-item"]');
    for (const el of allElements) {
      const text = el.innerText || '';
      if (text.match(/(closed|filled)/i) || (text.match(/\d{1,2}:\d{2}/) && text.match(/(BUY|SELL)/i))) {
        const trade = parseTradeFromText(text);
        if (trade && !trades.find(t => t.rawText === trade.rawText)) {
          trades.push(trade);
        }
      }
    }
  }
  
  return trades.slice(0, 20); // Keep last 20 trades
}

// Parse trade from table row
function parseTradeRow(row) {
  const cells = row.querySelectorAll('td');
  if (cells.length < 10) return null;
  
  try {
    const opened = cells[0]?.innerText?.trim();
    const closed = cells[1]?.innerText?.trim();
    const duration = cells[2]?.innerText?.trim();
    const pair = cells[3]?.innerText?.trim();
    const sideEl = cells[4]?.querySelector('.position-side');
    const side = sideEl ? sideEl.innerText.trim() : cells[4]?.innerText?.trim();
    const lotSize = cells[5]?.innerText?.trim();
    const entryPrice = cells[6]?.innerText?.trim();
    const exitPrice = cells[7]?.innerText?.trim();
    const action = cells[8]?.innerText?.trim();
    const entryType = cells[9]?.innerText?.trim();
    const exitType = cells[10]?.innerText?.trim();
    const totalFees = cells[11]?.innerText?.trim();
    const grossPnL = cells[12]?.innerText?.trim();
    const netPnL = cells[13]?.innerText?.trim();
    
    // Parse P&L
    const pnlText = netPnL || grossPnL;
    let pnl = null;
    if (pnlText) {
      const pnlMatch = pnlText.match(/([+-]?\$?[\d,.]+)/);
      if (pnlMatch) {
        pnl = parseFloat(pnlMatch[1].replace(/[$,]/g, ''));
      }
    }
    
    if (pair && side) {
      return {
        symbol: pair,
        side: side.toUpperCase(),
        opened,
        closed,
        duration,
        lotSize: parseFloat(lotSize) || null,
        entryPrice: entryPrice ? parseFloat(entryPrice.replace(/[$,]/g, '')) : null,
        exitPrice: exitPrice ? parseFloat(exitPrice.replace(/[$,]/g, '')) : null,
        action,
        entryType,
        exitType,
        fees: totalFees ? parseFloat(totalFees.replace(/[$,]/g, '')) : null,
        grossPnL: grossPnL ? parseFloat(grossPnL.replace(/[$,]/g, '')) : null,
        pnl,
        rawText: `${pair} ${side} ${pnlText || ''}`
      };
    }
  } catch (e) {
    console.error('Error parsing trade row:', e);
  }
  
  return null;
}

// Parse trade from text (fallback)
function parseTradeFromText(text) {
  const symbolMatch = text.match(/\b([A-Z]{2,10})\b/);
  const symbol = symbolMatch ? symbolMatch[1] : null;
  
  const sideMatch = text.match(/(BUY|SELL|LONG|SHORT)/i);
  const side = sideMatch ? sideMatch[1].toUpperCase() : null;
  
  const pnlMatch = text.match(/(?:profit|loss|P&L|Net P&L)\s*[:\s]*\$?([\d.,+-]+)/i);
  const pnl = pnlMatch ? parseFloat(pnlMatch[1].replace(/[,$]/g, '')) : null;
  
  const timeMatch = text.match(/(\d{1,2}:\d{2}(?::\d{2})?)/);
  const time = timeMatch ? timeMatch[1] : null;
  
  if (symbol && side) {
    return { symbol, side, pnl, time, rawText: text.substring(0, 150) };
  }
  return null;
}

// Extract Order History
function extractOrderHistory() {
  const orders = [];
  const allElements = document.querySelectorAll('tr, div[class*="order-history"], div[class*="history-item"]');
  
  for (const el of allElements) {
    const text = el.innerText || '';
    if (text.match(/(cancelled|rejected|expired|filled)/i)) {
      const order = parseOrderHistoryFromText(text);
      if (order && !orders.find(o => o.rawText === order.rawText)) {
        orders.push(order);
      }
    }
  }
  
  return orders.slice(0, 20);
}

// Parse order history from text
function parseOrderHistoryFromText(text) {
  const symbolMatch = text.match(/\b([A-Z]{2,10})\b/);
  const symbol = symbolMatch ? symbolMatch[1] : null;
  
  const statusMatch = text.match(/(filled|cancelled|rejected|expired)/i);
  const status = statusMatch ? statusMatch[1].toLowerCase() : 'unknown';
  
  const typeMatch = text.match(/(Limit|Stop|Market)/i);
  const type = typeMatch ? typeMatch[1] : 'Unknown';
  
  if (symbol) {
    return { symbol, status, type, rawText: text.substring(0, 100) };
  }
  return null;
}

// Extract account metrics (daily loss, total loss, etc.)
function extractAccountMetrics() {
  try {
    const pageText = document.body.innerText;
    
    // Look for daily loss
    const dailyLossMatch = pageText.match(/daily\s+loss[:\s]*\$?([\d.,-]+)/i);
    if (dailyLossMatch) {
      tradingData.dailyLoss = parseFloat(dailyLossMatch[1].replace(/,/g, ''));
    }
    
    // Look for total/max loss
    const totalLossMatch = pageText.match(/(?:total|max)\s+loss[:\s]*\$?([\d.,-]+)/i);
    if (totalLossMatch) {
      tradingData.totalLoss = parseFloat(totalLossMatch[1].replace(/,/g, ''));
    }
    
    // Look for profit target progress
    const profitMatch = pageText.match(/profit[:\s]*\$?([\d.,]+)/i);
    if (profitMatch) {
      tradingData.currentProfit = parseFloat(profitMatch[1].replace(/,/g, ''));
    }
  } catch (e) {
    console.error('TFR Guardian: Error extracting account metrics:', e);
  }
}

// Check if extension context is valid
function isExtensionContextValid() {
  try {
    return chrome.runtime && chrome.runtime.id;
  } catch (e) {
    return false;
  }
}

// Send trading data update to background
async function sendUpdateToBackground() {
  // Check if extension context is still valid
  if (!isExtensionContextValid()) {
    console.log('TFR Guardian: Extension context invalidated, stopping updates');
    return;
  }
  
  // First extract all data
  await extractAllTradingData();
  
  try {
    chrome.runtime.sendMessage({
      type: 'TRADING_DATA_UPDATE',
      data: {
        currentEquity: tradingData.currentEquity,
        balance: tradingData.balance,
        dailyStartBalance: tradingData.dailyStartBalance,
        dailyHighBalance: tradingData.dailyHighBalance,
        dailyLoss: tradingData.dailyLoss,
        totalLoss: tradingData.totalLoss,
        currentProfit: tradingData.currentProfit,
        openPositions: tradingData.openPositions,
        openOrders: tradingData.openOrders,
        tradeHistory: tradingData.tradeHistory,
        orderHistory: tradingData.orderHistory,
        todayTrades: tradingData.todayTrades,
        accountType: tradingData.accountType,
        accountSize: tradingData.accountSize,
        currentStage: tradingData.currentStage,
        challengeRules: tradingData.challengeRules,
        unrealizedPnl: tradingData.unrealizedPnl
      }
    }).catch(err => {
      // Silently ignore errors from invalidated context
      if (err.message && err.message.includes('context invalidated')) {
        console.log('TFR Guardian: Extension context invalidated');
      }
    });
  } catch (e) {
    // Extension context may be invalidated
    console.log('TFR Guardian: Error sending message:', e.message);
  }
}

// Create warning overlay element
function createWarningOverlay() {
  // Check if overlay already exists
  if (document.getElementById('tfr-warning-overlay')) return;
  
  const overlay = document.createElement('div');
  overlay.id = 'tfr-warning-overlay';
  overlay.className = 'tfr-overlay-hidden';
  overlay.innerHTML = `
    <div class="tfr-warning-container">
      <div class="tfr-warning-header">
        <span class="tfr-warning-icon">⚠️</span>
        <span class="tfr-warning-title">TRADING RULE VIOLATION</span>
        <button class="tfr-close-btn" onclick="this.closest('#tfr-warning-overlay').className='tfr-overlay-hidden'">×</button>
      </div>
      <div class="tfr-warning-content"></div>
      <div class="tfr-warning-actions">
        <button class="tfr-dismiss-btn" onclick="this.closest('#tfr-warning-overlay').className='tfr-overlay-hidden'">I Understand</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(overlay);
}

// Show warning overlay with violations
function showWarningOverlay(violations) {
  const overlay = document.getElementById('tfr-warning-overlay');
  if (!overlay) return;
  
  const content = overlay.querySelector('.tfr-warning-content');
  content.innerHTML = violations.map(v => `
    <div class="tfr-violation tfr-violation-${v.severity}">
      <div class="tfr-violation-rule">${v.rule}</div>
      <div class="tfr-violation-message">${v.message}</div>
    </div>
  `).join('');
  
  overlay.className = 'tfr-overlay-visible';
  
  // Auto-hide info messages after 10 seconds
  const hasCritical = violations.some(v => v.severity === 'critical');
  if (!hasCritical) {
    setTimeout(() => {
      overlay.className = 'tfr-overlay-hidden';
    }, 10000);
  }
}

// Cleanup when leaving page
window.addEventListener('beforeunload', () => {
  try {
    chrome.runtime.sendMessage({ type: 'PLATFORM_LEFT' });
  } catch (e) {
    // Extension context may be invalidated
  }
});
