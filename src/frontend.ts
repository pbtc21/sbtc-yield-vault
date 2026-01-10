// Frontend HTML for sBTC Yield Vault

export const VAULT_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>sBTC Yield Vault | 23% APY with BSD Looping</title>
  <meta name="description" content="Amplify your sBTC yield to 23% APY using BSD looping strategy on Zest Protocol">
  <meta property="og:title" content="sBTC Yield Vault">
  <meta property="og:description" content="Amplify your sBTC yield to 23% APY using BSD looping strategy">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    :root {
      --bg: #0a0a0f;
      --card: #12121a;
      --border: #1e1e2e;
      --text: #e4e4e7;
      --text-muted: #71717a;
      --accent: #f7931a;
      --accent-dim: rgba(247, 147, 26, 0.1);
      --green: #22c55e;
      --red: #ef4444;
      --blue: #3b82f6;
    }

    body {
      font-family: 'Inter', system-ui, sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      line-height: 1.6;
    }

    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 24px;
    }

    /* Header */
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 20px 0;
      border-bottom: 1px solid var(--border);
      margin-bottom: 40px;
    }

    .logo {
      display: flex;
      align-items: center;
      gap: 12px;
      font-weight: 700;
      font-size: 20px;
    }

    .logo-icon {
      width: 40px;
      height: 40px;
      background: var(--accent);
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
    }

    .connect-btn {
      background: var(--accent);
      color: #000;
      border: none;
      padding: 12px 24px;
      border-radius: 8px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }

    .connect-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 20px rgba(247, 147, 26, 0.3);
    }

    .connect-btn.connected {
      background: var(--card);
      color: var(--text);
      border: 1px solid var(--border);
    }

    /* Hero Stats */
    .hero {
      text-align: center;
      margin-bottom: 60px;
    }

    .hero h1 {
      font-size: 48px;
      font-weight: 700;
      margin-bottom: 16px;
    }

    .hero h1 span {
      color: var(--accent);
    }

    .hero p {
      color: var(--text-muted);
      font-size: 18px;
      max-width: 600px;
      margin: 0 auto 32px;
    }

    .apy-display {
      display: inline-flex;
      align-items: baseline;
      gap: 8px;
      background: var(--accent-dim);
      padding: 16px 32px;
      border-radius: 16px;
      border: 1px solid var(--accent);
    }

    .apy-display .number {
      font-size: 56px;
      font-weight: 700;
      color: var(--accent);
      font-family: 'JetBrains Mono', monospace;
    }

    .apy-display .label {
      font-size: 24px;
      color: var(--text-muted);
    }

    /* Stats Grid */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
      margin-bottom: 40px;
    }

    @media (max-width: 768px) {
      .stats-grid { grid-template-columns: repeat(2, 1fr); }
      .hero h1 { font-size: 32px; }
      .apy-display .number { font-size: 40px; }
    }

    .stat-card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 20px;
    }

    .stat-card .label {
      color: var(--text-muted);
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
    }

    .stat-card .value {
      font-size: 24px;
      font-weight: 600;
      font-family: 'JetBrains Mono', monospace;
    }

    .stat-card .value.green { color: var(--green); }
    .stat-card .value.accent { color: var(--accent); }

    /* Main Content */
    .main-grid {
      display: grid;
      grid-template-columns: 1fr 400px;
      gap: 24px;
    }

    @media (max-width: 900px) {
      .main-grid { grid-template-columns: 1fr; }
    }

    /* Card */
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 24px;
    }

    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
    }

    .card-title {
      font-size: 18px;
      font-weight: 600;
    }

    /* Simulator */
    .input-group {
      margin-bottom: 20px;
    }

    .input-group label {
      display: block;
      color: var(--text-muted);
      font-size: 14px;
      margin-bottom: 8px;
    }

    .input-row {
      display: flex;
      gap: 12px;
    }

    .input-row input {
      flex: 1;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 14px 16px;
      color: var(--text);
      font-size: 16px;
      font-family: 'JetBrains Mono', monospace;
    }

    .input-row input:focus {
      outline: none;
      border-color: var(--accent);
    }

    .input-row select {
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 14px 16px;
      color: var(--text);
      font-size: 16px;
      cursor: pointer;
    }

    .simulate-btn {
      width: 100%;
      background: var(--blue);
      color: white;
      border: none;
      padding: 16px;
      border-radius: 10px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      margin-bottom: 24px;
    }

    .simulate-btn:hover {
      background: #2563eb;
    }

    /* Results */
    .results {
      border-top: 1px solid var(--border);
      padding-top: 24px;
    }

    .result-row {
      display: flex;
      justify-content: space-between;
      padding: 12px 0;
      border-bottom: 1px solid var(--border);
    }

    .result-row:last-child {
      border-bottom: none;
    }

    .result-row .label {
      color: var(--text-muted);
    }

    .result-row .value {
      font-family: 'JetBrains Mono', monospace;
      font-weight: 500;
    }

    .result-row .value.highlight {
      color: var(--green);
      font-size: 18px;
      font-weight: 700;
    }

    /* Deposit Card */
    .deposit-card {
      position: sticky;
      top: 24px;
    }

    .balance-display {
      background: var(--bg);
      border-radius: 10px;
      padding: 16px;
      margin-bottom: 20px;
      text-align: center;
    }

    .balance-display .label {
      color: var(--text-muted);
      font-size: 13px;
      margin-bottom: 4px;
    }

    .balance-display .amount {
      font-size: 28px;
      font-weight: 700;
      font-family: 'JetBrains Mono', monospace;
    }

    .max-btn {
      background: var(--accent-dim);
      color: var(--accent);
      border: none;
      padding: 8px 16px;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
    }

    .deposit-btn {
      width: 100%;
      background: var(--accent);
      color: #000;
      border: none;
      padding: 18px;
      border-radius: 10px;
      font-size: 18px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.2s;
    }

    .deposit-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 20px rgba(247, 147, 26, 0.3);
    }

    .deposit-btn:disabled {
      background: var(--border);
      color: var(--text-muted);
      cursor: not-allowed;
      transform: none;
      box-shadow: none;
    }

    /* Loop Visualization */
    .loops-viz {
      margin: 24px 0;
    }

    .loop-step {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px;
      background: var(--bg);
      border-radius: 8px;
      margin-bottom: 8px;
      font-size: 14px;
    }

    .loop-step .num {
      width: 24px;
      height: 24px;
      background: var(--accent);
      color: #000;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 12px;
    }

    .loop-step .arrow {
      color: var(--text-muted);
    }

    /* Risk Warning */
    .risk-warning {
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.3);
      border-radius: 10px;
      padding: 16px;
      margin-top: 20px;
      font-size: 13px;
    }

    .risk-warning strong {
      color: var(--red);
    }

    /* Footer */
    footer {
      margin-top: 60px;
      padding: 24px 0;
      border-top: 1px solid var(--border);
      text-align: center;
      color: var(--text-muted);
      font-size: 13px;
    }

    footer a {
      color: var(--accent);
      text-decoration: none;
    }

    /* Loading state */
    .loading {
      opacity: 0.5;
      pointer-events: none;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }

    .loading-text {
      animation: pulse 1.5s infinite;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="logo">
        <div class="logo-icon">₿</div>
        <span>sBTC Yield Vault</span>
      </div>
      <button class="connect-btn" id="connectBtn" onclick="connectWallet()">
        Connect Wallet
      </button>
    </header>

    <section class="hero">
      <h1>Amplify Your <span>sBTC</span> Yield</h1>
      <p>Use BSD looping on Zest Protocol to earn up to 23% APY on your Bitcoin. Secure, transparent, and fully on-chain.</p>
      <div class="apy-display">
        <span class="number" id="currentApy">23.1</span>
        <span class="label">% APY</span>
      </div>
    </section>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="label">TVL</div>
        <div class="value" id="tvl">0.00 BTC</div>
      </div>
      <div class="stat-card">
        <div class="label">sBTC Supply APY</div>
        <div class="value accent" id="supplyApy">11.5%</div>
      </div>
      <div class="stat-card">
        <div class="label">USDh Borrow APY</div>
        <div class="value" id="borrowApy">3.5%</div>
      </div>
      <div class="stat-card">
        <div class="label">Health Factor</div>
        <div class="value green" id="healthFactor">1.43</div>
      </div>
    </div>

    <div class="main-grid">
      <div class="card">
        <div class="card-header">
          <h2 class="card-title">Yield Simulator</h2>
        </div>

        <div class="input-group">
          <label>Deposit Amount</label>
          <div class="input-row">
            <input type="number" id="simAmount" value="1" step="0.01" min="0.0001" placeholder="0.00">
            <select id="simLoops">
              <option value="3">3 Loops</option>
              <option value="4">4 Loops</option>
              <option value="5" selected>5 Loops</option>
            </select>
          </div>
        </div>

        <button class="simulate-btn" onclick="runSimulation()">
          Simulate Yield
        </button>

        <div class="results" id="results">
          <div class="result-row">
            <span class="label">Total Collateral</span>
            <span class="value" id="totalCollateral">-</span>
          </div>
          <div class="result-row">
            <span class="label">Total Debt (USDh)</span>
            <span class="value" id="totalDebt">-</span>
          </div>
          <div class="result-row">
            <span class="label">Leverage</span>
            <span class="value" id="leverage">-</span>
          </div>
          <div class="result-row">
            <span class="label">Gross APY</span>
            <span class="value" id="grossApy">-</span>
          </div>
          <div class="result-row">
            <span class="label">Borrow Cost</span>
            <span class="value" id="borrowCost">-</span>
          </div>
          <div class="result-row">
            <span class="label">Net APY (after fees)</span>
            <span class="value highlight" id="netApy">-</span>
          </div>
          <div class="result-row">
            <span class="label">Yearly Yield</span>
            <span class="value highlight" id="yearlyYield">-</span>
          </div>
        </div>

        <div class="loops-viz" id="loopsViz"></div>

        <div class="risk-warning">
          <strong>Risk Warning:</strong> Leveraged positions can be liquidated if BTC price drops significantly.
          Current liquidation threshold: <span id="liqPrice">$114,286</span> (14% drawdown).
        </div>
      </div>

      <div class="card deposit-card">
        <div class="card-header">
          <h2 class="card-title">Deposit</h2>
        </div>

        <div class="balance-display">
          <div class="label">Your sBTC Balance</div>
          <div class="amount" id="userBalance">-.----</div>
        </div>

        <div class="input-group">
          <label>Amount to Deposit</label>
          <div class="input-row">
            <input type="number" id="depositAmount" value="1" step="0.01" min="0.0001" placeholder="0.00">
            <button class="max-btn" onclick="setMaxDeposit()">MAX</button>
          </div>
        </div>

        <div class="input-group">
          <label>Strategy</label>
          <select id="depositLoops" style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:14px 16px;color:var(--text);font-size:16px;">
            <option value="3">Conservative (3 loops, ~18% APY)</option>
            <option value="4">Balanced (4 loops, ~21% APY)</option>
            <option value="5" selected>Aggressive (5 loops, ~23% APY)</option>
          </select>
        </div>

        <button class="deposit-btn" id="depositBtn" onclick="deposit()" disabled>
          Connect Wallet to Deposit
        </button>

        <div style="margin-top:16px;text-align:center;color:var(--text-muted);font-size:13px;">
          10% management fee on profits
        </div>
      </div>
    </div>

    <footer>
      <p>Built on <a href="https://www.stacks.co" target="_blank">Stacks</a> |
      Powered by <a href="https://www.zestprotocol.com" target="_blank">Zest Protocol</a> &
      <a href="https://hermetica.fi" target="_blank">BSD/USDh</a></p>
      <p style="margin-top:8px;">Contract: <a href="https://explorer.hiro.so/txid/SP2QXPFF4M72QYZWXE7S5321XJDJ2DD32DGEMN5QA.sbtc-yield-vault-v3?chain=mainnet" target="_blank">sbtc-yield-vault-v3</a></p>
    </footer>
  </div>

  <script>
    const API_BASE = '';
    let userAddress = null;
    let userBalance = 0;

    // Load stats on page load
    async function loadStats() {
      try {
        const res = await fetch(API_BASE + '/stats');
        const data = await res.json();

        document.getElementById('tvl').textContent = data.vault.totalAssetsBtc + ' BTC';
        document.getElementById('supplyApy').textContent = data.market.zestSupplyApy + '%';
        document.getElementById('borrowApy').textContent = data.market.zestBorrowApy + '%';
        document.getElementById('healthFactor').textContent = data.health.factor;
      } catch (e) {
        console.error('Failed to load stats:', e);
      }
    }

    // Run simulation
    async function runSimulation() {
      const amount = document.getElementById('simAmount').value;
      const loops = document.getElementById('simLoops').value;
      const sats = Math.floor(parseFloat(amount) * 100_000_000);

      try {
        const res = await fetch(API_BASE + '/simulate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount: sats.toString(), loops: parseInt(loops) })
        });
        const data = await res.json();

        // Update results
        document.getElementById('totalCollateral').textContent = data.simulation.totalDepositedBtc + ' BTC';
        document.getElementById('totalDebt').textContent = data.simulation.totalBorrowedUsd;
        document.getElementById('leverage').textContent = data.simulation.finalLeverage;
        document.getElementById('grossApy').textContent = data.projectedYield.grossApy;
        document.getElementById('borrowCost').textContent = '-' + data.projectedYield.borrowCost;
        document.getElementById('netApy').textContent = data.projectedYield.afterFees;
        document.getElementById('yearlyYield').textContent = data.projectedYield.yearlyYieldBtc + ' BTC (' + data.projectedYield.yearlyYieldUsd + ')';
        document.getElementById('liqPrice').textContent = data.risks.liquidationPrice;
        document.getElementById('currentApy').textContent = parseFloat(data.projectedYield.afterFees).toFixed(1);

        // Update loops visualization
        const loopsViz = document.getElementById('loopsViz');
        loopsViz.innerHTML = data.simulation.iterations.map((iter, i) => \`
          <div class="loop-step">
            <span class="num">\${iter.loop}</span>
            <span>Deposit \${iter.depositBtc} BTC</span>
            <span class="arrow">→</span>
            <span>Borrow \${iter.borrowUsd}</span>
            <span class="arrow">→</span>
            <span>Get \${iter.swapReceiveBtc} BTC</span>
          </div>
        \`).join('');

      } catch (e) {
        console.error('Simulation failed:', e);
        alert('Simulation failed. Please try again.');
      }
    }

    // Connect wallet
    async function connectWallet() {
      if (typeof window.LeatherProvider !== 'undefined' || typeof window.StacksProvider !== 'undefined') {
        try {
          const provider = window.LeatherProvider || window.StacksProvider;
          const response = await provider.request({ method: 'getAddresses' });
          const addresses = response.result.addresses;
          const stxAddress = addresses.find(a => a.type === 'stx')?.address;

          if (stxAddress) {
            userAddress = stxAddress;
            document.getElementById('connectBtn').textContent = stxAddress.slice(0, 6) + '...' + stxAddress.slice(-4);
            document.getElementById('connectBtn').classList.add('connected');
            document.getElementById('depositBtn').disabled = false;
            document.getElementById('depositBtn').textContent = 'Deposit sBTC';

            // Fetch balance
            await fetchBalance(stxAddress);
          }
        } catch (e) {
          console.error('Wallet connection failed:', e);
          alert('Failed to connect wallet. Please make sure Leather or Xverse is installed.');
        }
      } else {
        window.open('https://leather.io', '_blank');
      }
    }

    async function fetchBalance(address) {
      try {
        const res = await fetch(\`https://api.mainnet.hiro.so/extended/v1/address/\${address}/balances\`);
        const data = await res.json();
        // Find sBTC balance
        const sbtc = data.fungible_tokens?.['SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token::sbtc'];
        if (sbtc) {
          userBalance = parseInt(sbtc.balance) / 100_000_000;
          document.getElementById('userBalance').textContent = userBalance.toFixed(8);
        } else {
          document.getElementById('userBalance').textContent = '0.00000000';
        }
      } catch (e) {
        console.error('Failed to fetch balance:', e);
      }
    }

    function setMaxDeposit() {
      document.getElementById('depositAmount').value = userBalance.toFixed(8);
    }

    async function deposit() {
      if (!userAddress) {
        await connectWallet();
        return;
      }

      const amount = document.getElementById('depositAmount').value;
      const loops = document.getElementById('depositLoops').value;
      const sats = Math.floor(parseFloat(amount) * 100_000_000);

      try {
        const res = await fetch(API_BASE + '/deposit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: sats.toString(),
            sender: userAddress,
            maxLossBps: 500 // 5% max loss
          })
        });
        const data = await res.json();

        // In production, would use Stacks Connect to sign and broadcast
        alert('Deposit transaction ready! Amount: ' + amount + ' BTC\\n\\nIn production, this would open your wallet to sign.');
        console.log('Transaction:', data.transaction);

      } catch (e) {
        console.error('Deposit failed:', e);
        alert('Deposit failed. Please try again.');
      }
    }

    // Initialize
    loadStats();
    runSimulation();
  </script>
</body>
</html>`;
