/**
 * TheFundedRoom Rules Engine
 * Defines all trading rules for different account types
 */

// Use var to avoid redeclaration errors if script loads multiple times
var AccountTypes = AccountTypes || {
  INSTANT_FUNDING: 'instant_funding',
  ONE_STEP: 'one_step',
  TWO_STEP: 'two_step'
};

var RuleDefinitions = RuleDefinitions || {
  [AccountTypes.INSTANT_FUNDING]: {
    name: 'Instant Funding',
    profitTarget: null, // No target
    dailyLossLimit: 0.03, // 3%
    maxTotalLoss: 0.06, // 6%
    minTradingDaysBeforePayout: 7,
    consistencyCap: 0.15, // 15% - no single day profit > 15% of total
    leverage: {
      forex: 30,
      commodities: 10,
      crypto: 1
    },
    profitSplit: 0.80,
    timeLimit: null, // No time limit
    inactivityLimit: 30, // days
    newsTrading: {
      evaluation: true,
      funded: 'restricted' // Profits within 3 min of high-impact news may not count
    }
  },
  [AccountTypes.ONE_STEP]: {
    name: 'One-Step Evaluation',
    stages: {
      evaluation: {
        profitTarget: 0.10, // 10%
        dailyLossLimit: 0.03,
        maxTotalLoss: 0.06,
        minTradingDays: 3,
        timeLimit: null
      },
      funded: {
        profitTarget: null,
        dailyLossLimit: 0.03,
        maxTotalLoss: 0.06,
        minTradingDaysBeforePayout: 0
      }
    },
    leverage: {
      forex: 30,
      commodities: 10,
      crypto: 1
    },
    profitSplit: 0.80,
    inactivityLimit: 30,
    newsTrading: {
      evaluation: true,
      funded: 'restricted'
    }
  },
  [AccountTypes.TWO_STEP]: {
    name: 'Two-Step Evaluation',
    stages: {
      stage1: {
        profitTarget: 0.08, // 8%
        dailyLossLimit: 0.05, // 5%
        maxTotalLoss: 0.10, // 10%
        minTradingDays: 5,
        timeLimit: null
      },
      stage2: {
        profitTarget: 0.05, // 5%
        dailyLossLimit: 0.05,
        maxTotalLoss: 0.10,
        minTradingDays: 5,
        timeLimit: null
      },
      funded: {
        profitTarget: null,
        dailyLossLimit: 0.05,
        maxTotalLoss: 0.10,
        maxRiskPerTrade: 0.03, // < 3% risk per trade
        minTradingDaysBeforePayout: 0
      }
    },
    leverage: {
      forex: 100,
      commodities: 30,
      crypto: 2
    },
    profitSplit: 0.80,
    inactivityLimit: 30,
    newsTrading: {
      evaluation: true,
      funded: 'restricted'
    }
  }
};

// Common rules across all account types
var CommonRules = CommonRules || {
  prohibitedActivities: [
    'hedging_across_accounts',
    'copy_trading',
    'high_frequency_trading',
    'third_party_pass_eas',
    'trading_on_behalf_of_others'
  ],
  allowedEAs: [
    'trade_management',
    'risk_management',
    'personal_strategies'
  ],
  payoutSchedule: {
    day: 'Monday',
    minWithdrawal: 100,
    methods: ['USDT_ERC20', 'USDT_BEP20', 'USDT_TRC20'],
    processingTime: 'Under 2 hours (up to 24 hours for verification)'
  },
  weekendHolding: true,
  overnightHolding: true
};

// Rule violation severity levels
var ViolationSeverity = ViolationSeverity || {
  CRITICAL: 'critical', // Will breach account
  WARNING: 'warning',   // Approaching limit
  INFO: 'info'          // Good to know
};

/**
 * Rules Engine Class
 */
var RulesEngine = RulesEngine || class RulesEngine {
  constructor(accountType, accountSize, currentStage = null) {
    this.accountType = accountType;
    this.accountSize = accountSize;
    this.currentStage = currentStage;
    this.rules = RuleDefinitions[accountType];
    this.dailyStartBalance = accountSize;
    this.dailyStartTime = this.getDailyStartTime();
    this.peakBalance = accountSize;
    this.tradingDays = 0;
    this.dailyProfits = []; // For consistency rule
  }

  getDailyStartTime() {
    // Daily start balance calculated at 2 AM UTC
    const now = new Date();
    const utc = new Date(now.getTime() + now.getTimezoneOffset() * 60000);
    const startTime = new Date(utc);
    startTime.setUTCHours(2, 0, 0, 0);
    if (utc < startTime) {
      startTime.setUTCDate(startTime.getUTCDate() - 1);
    }
    return startTime;
  }

  /**
   * Check if current equity violates daily loss limit
   */
  checkDailyLossLimit(currentEquity) {
    const rules = this.getCurrentRules();
    const dailyLossLimit = rules.dailyLossLimit;
    const maxAllowedLoss = this.dailyStartBalance * dailyLossLimit;
    const currentLoss = this.dailyStartBalance - currentEquity;
    const lossPercentage = currentLoss / this.dailyStartBalance;

    const violations = [];

    if (currentLoss >= maxAllowedLoss) {
      violations.push({
        rule: 'Daily Loss Limit',
        severity: ViolationSeverity.CRITICAL,
        message: `DAILY LOSS LIMIT BREACHED! You have lost ${(lossPercentage * 100).toFixed(2)}% (Limit: ${(dailyLossLimit * 100).toFixed(0)}%)`,
        current: lossPercentage,
        limit: dailyLossLimit,
        remaining: 0
      });
    } else if (lossPercentage >= dailyLossLimit * 0.8) {
      violations.push({
        rule: 'Daily Loss Limit',
        severity: ViolationSeverity.WARNING,
        message: `WARNING: You are at ${(lossPercentage * 100).toFixed(2)}% daily loss (Limit: ${(dailyLossLimit * 100).toFixed(0)}%)`,
        current: lossPercentage,
        limit: dailyLossLimit,
        remaining: dailyLossLimit - lossPercentage
      });
    }

    return violations;
  }

  /**
   * Check if current equity violates max total loss
   */
  checkMaxTotalLoss(currentEquity) {
    const rules = this.getCurrentRules();
    const maxTotalLoss = rules.maxTotalLoss;
    const maxAllowedDrawdown = this.accountSize * maxTotalLoss;
    const currentDrawdown = this.accountSize - currentEquity;
    const drawdownPercentage = currentDrawdown / this.accountSize;

    const violations = [];

    if (currentDrawdown >= maxAllowedDrawdown) {
      violations.push({
        rule: 'Max Total Loss',
        severity: ViolationSeverity.CRITICAL,
        message: `MAX TOTAL LOSS BREACHED! Account drawdown is ${(drawdownPercentage * 100).toFixed(2)}% (Limit: ${(maxTotalLoss * 100).toFixed(0)}%)`,
        current: drawdownPercentage,
        limit: maxTotalLoss,
        remaining: 0
      });
    } else if (drawdownPercentage >= maxTotalLoss * 0.8) {
      violations.push({
        rule: 'Max Total Loss',
        severity: ViolationSeverity.WARNING,
        message: `WARNING: Total drawdown at ${(drawdownPercentage * 100).toFixed(2)}% (Limit: ${(maxTotalLoss * 100).toFixed(0)}%)`,
        current: drawdownPercentage,
        limit: maxTotalLoss,
        remaining: maxTotalLoss - drawdownPercentage
      });
    }

    return violations;
  }

  /**
   * Check profit target progress
   */
  checkProfitTarget(currentEquity) {
    const rules = this.getCurrentRules();
    if (!rules.profitTarget) return [];

    const profitTargetAmount = this.accountSize * rules.profitTarget;
    const currentProfit = currentEquity - this.accountSize;
    const progressPercentage = currentProfit / profitTargetAmount;

    const violations = [];

    if (currentProfit >= profitTargetAmount) {
      violations.push({
        rule: 'Profit Target',
        severity: ViolationSeverity.INFO,
        message: `🎉 PROFIT TARGET REACHED! ${(progressPercentage * 100).toFixed(2)}% completed`,
        current: progressPercentage,
        target: rules.profitTarget,
        remaining: 0
      });
    } else if (progressPercentage >= 0.5) {
      violations.push({
        rule: 'Profit Target',
        severity: ViolationSeverity.INFO,
        message: `Progress: ${(progressPercentage * 100).toFixed(2)}% of profit target (${(rules.profitTarget * 100).toFixed(0)}%)`,
        current: progressPercentage,
        target: rules.profitTarget,
        remaining: rules.profitTarget - (currentProfit / this.accountSize)
      });
    }

    return violations;
  }

  /**
   * Check consistency rule (Instant Funding only)
   */
  checkConsistencyRule(dailyProfit) {
    if (this.accountType !== AccountTypes.INSTANT_FUNDING) return [];

    const rules = this.getCurrentRules();
    if (!rules.consistencyCap) return [];

    this.dailyProfits.push(dailyProfit);
    const totalProfit = this.dailyProfits.reduce((a, b) => a + b, 0);
    
    if (totalProfit <= 0) return [];

    const maxAllowedSingleDay = totalProfit * rules.consistencyCap;
    const maxDailyProfit = Math.max(...this.dailyProfits);
    const consistencyRatio = maxDailyProfit / totalProfit;

    const violations = [];

    if (consistencyRatio > rules.consistencyCap) {
      violations.push({
        rule: 'Consistency Rule',
        severity: ViolationSeverity.CRITICAL,
        message: `CONSISTENCY RULE VIOLATION! Single day profit (${maxDailyProfit.toFixed(2)}) exceeds ${(rules.consistencyCap * 100).toFixed(0)}% of total profits`,
        current: consistencyRatio,
        limit: rules.consistencyCap,
        remaining: 0
      });
    } else if (consistencyRatio > rules.consistencyCap * 0.8) {
      violations.push({
        rule: 'Consistency Rule',
        severity: ViolationSeverity.WARNING,
        message: `WARNING: Single day profit is ${(consistencyRatio * 100).toFixed(2)}% of total (Limit: ${(rules.consistencyCap * 100).toFixed(0)}%)`,
        current: consistencyRatio,
        limit: rules.consistencyCap,
        remaining: rules.consistencyCap - consistencyRatio
      });
    }

    return violations;
  }

  /**
   * Check risk per trade (Two-Step funded only)
   */
  checkRiskPerTrade(riskAmount) {
    if (this.accountType !== AccountTypes.TWO_STEP || this.currentStage !== 'funded') {
      return [];
    }

    const rules = this.getCurrentRules();
    if (!rules.maxRiskPerTrade) return [];

    const maxRisk = this.accountSize * rules.maxRiskPerTrade;
    const riskPercentage = riskAmount / this.accountSize;

    const violations = [];

    if (riskAmount > maxRisk) {
      violations.push({
        rule: 'Max Risk Per Trade',
        severity: ViolationSeverity.CRITICAL,
        message: `RISK LIMIT EXCEEDED! Trade risk is ${(riskPercentage * 100).toFixed(2)}% (Max: ${(rules.maxRiskPerTrade * 100).toFixed(0)}%)`,
        current: riskPercentage,
        limit: rules.maxRiskPerTrade,
        remaining: 0
      });
    } else if (riskPercentage >= rules.maxRiskPerTrade * 0.8) {
      violations.push({
        rule: 'Max Risk Per Trade',
        severity: ViolationSeverity.WARNING,
        message: `WARNING: Trade risk is ${(riskPercentage * 100).toFixed(2)}% (Limit: ${(rules.maxRiskPerTrade * 100).toFixed(0)}%)`,
        current: riskPercentage,
        limit: rules.maxRiskPerTrade,
        remaining: rules.maxRiskPerTrade - riskPercentage
      });
    }

    return violations;
  }

  /**
   * Check minimum trading days requirement
   */
  checkMinTradingDays() {
    const rules = this.getCurrentRules();
    const minDays = rules.minTradingDays || rules.minTradingDaysBeforePayout;
    
    if (!minDays || minDays === 0) return [];

    const violations = [];

    if (this.tradingDays < minDays) {
      const remaining = minDays - this.tradingDays;
      violations.push({
        rule: 'Minimum Trading Days',
        severity: ViolationSeverity.INFO,
        message: `Need ${remaining} more trading day${remaining > 1 ? 's' : ''} (Min: ${minDays})`,
        current: this.tradingDays,
        target: minDays,
        remaining: remaining
      });
    } else {
      violations.push({
        rule: 'Minimum Trading Days',
        severity: ViolationSeverity.INFO,
        message: `✓ Minimum trading days requirement met (${this.tradingDays}/${minDays})`,
        current: this.tradingDays,
        target: minDays,
        remaining: 0
      });
    }

    return violations;
  }

  /**
   * Get current rules based on account type and stage
   */
  getCurrentRules() {
    const rules = RuleDefinitions[this.accountType];
    
    if (rules.stages && this.currentStage) {
      return { ...rules, ...rules.stages[this.currentStage] };
    }
    
    return rules;
  }

  /**
   * Run all rule checks
   */
  checkAllRules(tradingData) {
    const violations = [];

    if (tradingData.currentEquity !== undefined) {
      violations.push(...this.checkDailyLossLimit(tradingData.currentEquity));
      violations.push(...this.checkMaxTotalLoss(tradingData.currentEquity));
      violations.push(...this.checkProfitTarget(tradingData.currentEquity));
    }

    if (tradingData.dailyProfit !== undefined) {
      violations.push(...this.checkConsistencyRule(tradingData.dailyProfit));
    }

    if (tradingData.riskAmount !== undefined) {
      violations.push(...this.checkRiskPerTrade(tradingData.riskAmount));
    }

    violations.push(...this.checkMinTradingDays());

    return violations.sort((a, b) => {
      const severityOrder = { [ViolationSeverity.CRITICAL]: 0, [ViolationSeverity.WARNING]: 1, [ViolationSeverity.INFO]: 2 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });
  }

  /**
   * Get account summary
   */
  getAccountSummary(currentEquity) {
    const rules = this.getCurrentRules();
    const currentProfit = currentEquity - this.accountSize;
    const profitPercentage = currentProfit / this.accountSize;

    return {
      accountType: this.rules.name,
      accountSize: this.accountSize,
      currentEquity: currentEquity,
      currentProfit: currentProfit,
      profitPercentage: profitPercentage,
      dailyLossLimit: rules.dailyLossLimit,
      maxTotalLoss: rules.maxTotalLoss,
      profitTarget: rules.profitTarget,
      stage: this.currentStage,
      leverage: rules.leverage
    };
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { RulesEngine, AccountTypes, RuleDefinitions, CommonRules, ViolationSeverity };
}
