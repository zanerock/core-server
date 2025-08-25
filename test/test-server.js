#!/usr/bin/env node

const http = require('http')
const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')

// Log tracking for failure reports
const nodeVersionForFiles = process.version.replace(/\./g, '_')
let logFilePath = `/project/test-staging/integration-results/server-log-${nodeVersionForFiles}.txt`
let initialLogLineCount = 0

// Extract binary name from package.json
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'))
const BINARY_NAME = Object.keys(packageJson.bin || {})[0] || 'sdlcforge-server'

// Configuration  
const SERVER_PORT = process.env.SERVER_PORT || 32600
const SERVER_HOST = 'localhost'
console.log(`Test script using SERVER_PORT: ${SERVER_PORT} (from env: ${process.env.SERVER_PORT})`)
const TEST_TIMEOUT = 30000 // 30 seconds

// Test results collector
const testResults = {
  nodeVersion: process.version,
  tests: [],
  passed: 0,
  failed: 0
}

// Helper function to make HTTP requests
function makeRequest(options, testContext = null) {
  return new Promise((resolve, reject) => {
    // Capture request details if testContext provided
    if (testContext) {
      testContext.request = {
        hostname: options.hostname,
        port: options.port,
        path: options.path,
        method: options.method,
        headers: options.headers || {},
        body: options.body || null
      }
    }
    
    const req = http.request(options, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        const response = {
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        }
        
        // Capture response details if testContext provided
        if (testContext) {
          testContext.response = response
        }
        
        resolve(response)
      })
    })
    
    req.on('error', reject)
    req.setTimeout(5000)
    
    if (options.body) {
      req.write(options.body)
    }
    req.end()
  })
}

// Wait for server to be ready
async function waitForServer(maxAttempts = 30) {
  console.log(`Waiting for server at ${SERVER_HOST}:${SERVER_PORT}/heartbeat`)
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await makeRequest({
        hostname: SERVER_HOST,
        port: SERVER_PORT,
        path: '/heartbeat',
        method: 'GET'
      })
      
      if (response.statusCode === 200) {
        console.log('Server is ready')
        return true
      }
      console.log(`Attempt ${i + 1}: Got status ${response.statusCode}`)
    } catch (error) {
      console.log(`Attempt ${i + 1}: Connection failed - ${error.message}`)
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  
  throw new Error('Server failed to start within timeout period')
}

// Generate detailed failure report
function generateFailureReport(testName, error, request = null, response = null) {
  try {
    // Create results directory
    const resultsDir = '/project/test-staging/integration-results'
    if (!fs.existsSync(resultsDir)) {
      fs.mkdirSync(resultsDir, { recursive: true })
    }
    
    // Convert test name to dash-case
    const fileName = testName.toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[()]/g, '')
      .replace(/[^a-z0-9-]/g, '')
    
    const reportFile = path.join(resultsDir, `${fileName}-failure-report-${nodeVersionForFiles}.txt`)
    
    // Get current log line count and extract new logs since test started
    let newLogs = 'No new logs available'
    try {
      if (fs.existsSync(logFilePath)) {
        const currentLogs = fs.readFileSync(logFilePath, 'utf8')
        const currentLineCount = currentLogs.split('\n').length
        const logDifference = currentLineCount - initialLogLineCount
        
        if (logDifference > 0) {
          const { execSync } = require('child_process')
          newLogs = execSync(`tail -n ${logDifference} "${logFilePath}"`, { encoding: 'utf8' }).trim()
        }
      }
    } catch (logError) {
      newLogs = `Error reading logs: ${logError.message}`
    }
    
    // Generate report content
    const report = [
      `FAILURE REPORT: ${testName}`,
      '='.repeat(60),
      '',
      'ERROR:',
      error.message,
      '',
      'REQUEST DETAILS:',
      request ? [
        `Method: ${request.method}`,
        `URL: http://${request.hostname}:${request.port}${request.path}`,
        'Headers:',
        Object.keys(request.headers).length > 0 ? 
          Object.entries(request.headers).map(([key, value]) => `  ${key}: ${value}`).join('\n') : 
          '  (none)',
        request.body ? `Body:\n${request.body}` : 'Body: (none)'
      ].join('\n') : 'No request details available',
      '',
      'RESPONSE DETAILS:',
      response ? [
        `Status Code: ${response.statusCode}`,
        'Headers:',
        Object.entries(response.headers).map(([key, value]) => `  ${key}: ${value}`).join('\n'),
        `Body:\n${response.body}`
      ].join('\n') : 'No response details available',
      '',
      'SERVER LOGS (since test started):',
      '-'.repeat(40),
      newLogs,
      '',
      'Generated at:', new Date().toISOString()
    ].join('\n')
    
    fs.writeFileSync(reportFile, report)
    console.log(`Failure report written to: ${reportFile}`)
  } catch (reportError) {
    console.error(`Failed to generate failure report: ${reportError.message}`)
  }
}

// Test suite
async function runTests() {
  // Initialize log line count for failure reporting
  try {
    if (fs.existsSync(logFilePath)) {
      const logs = fs.readFileSync(logFilePath, 'utf8')
      initialLogLineCount = logs.split('\n').length
    }
  } catch (error) {
    console.log(`Warning: Could not read log file for failure reporting: ${error.message}`)
  }

  const tests = [
    {
      name: 'Server Status (heartbeat)',
      async run(testContext) {
        const response = await makeRequest({
          hostname: SERVER_HOST,
          port: SERVER_PORT,
          path: '/heartbeat',
          method: 'GET'
        }, testContext)
        
        if (response.statusCode !== 200) {
          throw new Error(`Expected status 200, got ${response.statusCode}`)
        }
        
        const data = JSON.parse(response.body)
        // NOTE: Currently returns 'true' but should ideally return {status: 'OK'} 
        // for proper API consistency
        if (data !== true) {
          throw new Error('Server heartbeat should return true')
        }
      }
    },
    {
      name: 'Server Version',
      async run(testContext) {
        const response = await makeRequest({
          hostname: SERVER_HOST,
          port: SERVER_PORT,
          path: '/server/version',
          method: 'GET'
        }, testContext)
        
        if (response.statusCode !== 200) {
          throw new Error(`Expected status 200, got ${response.statusCode}`)
        }
        
        const data = JSON.parse(response.body)
        if (!data.version) {
          throw new Error('No version information returned')
        }
      }
    },
    {
      name: 'API Documentation',
      async run(testContext) {
        const response = await makeRequest({
          hostname: SERVER_HOST,
          port: SERVER_PORT,
          path: '/server/api',
          method: 'GET'
        }, testContext)
        
        if (response.statusCode !== 200) {
          throw new Error(`Expected status 200, got ${response.statusCode}`)
        }
        
        const data = JSON.parse(response.body)
        if (!Array.isArray(data)) {
          throw new Error('API response is not an array')
        }
        
        if (data.length === 0) {
          throw new Error('No API endpoints registered')
        }
      }
    },
    {
      name: 'List Plugins',
      async run(testContext) {
        const response = await makeRequest({
          hostname: SERVER_HOST,
          port: SERVER_PORT,
          path: '/server/plugins/list',
          method: 'GET',
          headers: {
            'Accept': 'application/json'
          }
        }, testContext)
        
        if (response.statusCode !== 200) {
          throw new Error(`Expected status 200, got ${response.statusCode}`)
        }
        
        const data = JSON.parse(response.body)
        if (!data.data || !Array.isArray(data.data)) {
          throw new Error('Invalid plugin list response')
        }
      }
    },
    {
      name: 'Server Next Commands',
      async run(testContext) {
        const response = await makeRequest({
          hostname: SERVER_HOST,
          port: SERVER_PORT,
          path: '/server/next-commands',
          method: 'GET'
        }, testContext)
        
        if (response.statusCode !== 200) {
          throw new Error(`Expected status 200, got ${response.statusCode}`)
        }
        
        const data = JSON.parse(response.body)
        if (!data.commands || !Array.isArray(data.commands)) {
          throw new Error('Invalid next-commands response')
        }
      }
    },
    {
      name: 'Invalid Endpoint Returns 404',
      async run(testContext) {
        const response = await makeRequest({
          hostname: SERVER_HOST,
          port: SERVER_PORT,
          path: '/invalid/endpoint',
          method: 'GET'
        }, testContext)
        
        if (response.statusCode !== 404) {
          throw new Error(`Expected status 404, got ${response.statusCode}`)
        }
      }
    },
    {
      name: 'Server Accepts JSON',
      async run(testContext) {
        const response = await makeRequest({
          hostname: SERVER_HOST,
          port: SERVER_PORT,
          path: '/server/status',
          method: 'GET',
          headers: {
            'Accept': 'application/json'
          }
        }, testContext)
        
        if (response.statusCode !== 200) {
          throw new Error(`Expected status 200, got ${response.statusCode}`)
        }
        
        if (!response.headers['content-type'].includes('application/json')) {
          throw new Error('Response is not JSON')
        }
      }
    }
  ]
  
  // Run each test
  for (const test of tests) {
    // Wrap test run to capture request/response details
    const testContext = {
      request: null,
      response: null
    }
    
    try {
      // Capture the initial log count before this test
      let preTestLogCount = initialLogLineCount
      try {
        if (fs.existsSync(logFilePath)) {
          const logs = fs.readFileSync(logFilePath, 'utf8')
          preTestLogCount = logs.split('\n').length
        }
      } catch (e) {}
      
      await test.run(testContext)
      testResults.tests.push({
        name: test.name,
        status: 'PASSED'
      })
      testResults.passed++
      console.log(`✓ ${test.name}`)
    } catch (error) {
      testResults.tests.push({
        name: test.name,
        status: 'FAILED',
        error: error.message
      })
      testResults.failed++
      console.log(`✗ ${test.name}: ${error.message}`)
      
      // Generate detailed failure report
      generateFailureReport(test.name, error, testContext.request, testContext.response)
    }
  }
  
  return testResults
}

// Start the server
async function startServer() {
  return new Promise((resolve, reject) => {
    const serverProcess = spawn(BINARY_NAME, [], {
      env: { ...process.env, NODE_ENV: 'test' },
      stdio: ['ignore', 'pipe', 'pipe']
    })
    
    let serverLogs = ''
    let serverErrors = ''
    let hasExited = false
    
    // Directory should already exist from main(), but double-check
    const logDir = path.dirname(logFilePath)
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true })
    }
    
    // Initialize or clear the log file
    fs.writeFileSync(logFilePath, '')
    
    serverProcess.stdout.on('data', (data) => {
      const output = data.toString()
      serverLogs += output
      console.log(`[Server]: ${output}`)
      
      // Append to log file
      try {
        fs.appendFileSync(logFilePath, output)
      } catch (e) {
        console.error(`Failed to write to log file: ${e.message}`)
      }
    })
    
    serverProcess.stderr.on('data', (data) => {
      const output = data.toString()
      serverErrors += output
      console.error(`[Server Error]: ${output}`)
      
      // Append errors to log file as well
      try {
        fs.appendFileSync(logFilePath, `[ERROR] ${output}`)
      } catch (e) {
        console.error(`Failed to write to log file: ${e.message}`)
      }
    })
    
    serverProcess.on('error', (error) => {
      reject(new Error(`Failed to start server: ${error.message}`))
    })
    
    serverProcess.on('exit', (code, signal) => {
      hasExited = true
      if (code !== 0) {
        reject(new Error(`Server exited unexpectedly with code ${code}. Last errors: ${serverErrors.slice(-500)}`))
      }
    })
    
    // Give server time to start, then check if it's still running
    setTimeout(() => {
      if (hasExited) {
        reject(new Error(`Server exited during startup. Last errors: ${serverErrors.slice(-500)}`))
      } else {
        resolve(serverProcess)
      }
    }, 3000) // Increased timeout to 3 seconds
  })
}

// Main test runner
async function main() {
  let serverProcess = null
  
  try {
    console.log(`Starting tests with Node ${process.version}`)
    
    // Ensure base directories exist
    const resultsDir = '/project/test-staging/integration-results'
    if (!fs.existsSync(resultsDir)) {
      fs.mkdirSync(resultsDir, { recursive: true })
    }
    
    // Clear results directory for this node version
    if (fs.existsSync(resultsDir)) {
      const files = fs.readdirSync(resultsDir)
      for (const file of files) {
        if (file.includes(nodeVersionForFiles)) {
          const filePath = path.join(resultsDir, file)
          try {
            fs.unlinkSync(filePath)
            console.log(`Cleared previous result: ${file}`)
          } catch (e) {
            console.log(`Warning: Could not remove ${file}: ${e.message}`)
          }
        }
      }
    }
    
    console.log(`Starting ${BINARY_NAME}...`)
    
    serverProcess = await startServer()
    
    console.log('Waiting for server to be ready...')
    await waitForServer()
    
    console.log('Running test suite...')
    const results = await runTests()
    
    // Print summary
    console.log('\n' + '='.repeat(50))
    console.log(`Test Results for Node ${process.version}`)
    console.log('='.repeat(50))
    console.log(`Passed: ${results.passed}`)
    console.log(`Failed: ${results.failed}`)
    console.log('='.repeat(50))
    
    // Write results to file
    const resultsFile = `${resultsDir}/test-results-node-${process.version.replace(/\./g, '_')}.json`
    if (!fs.existsSync(resultsDir)) {
      fs.mkdirSync(resultsDir, { recursive: true })
    }
    fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2))
    console.log(`Results written to ${resultsFile}`)
    
    // Exit with appropriate code
    process.exit(results.failed > 0 ? 1 : 0)
    
  } catch (error) {
    console.error('Test suite failed:', error)
    process.exit(1)
  } finally {
    // Clean up server process
    if (serverProcess) {
      serverProcess.kill('SIGTERM')
    }
  }
}

// Run if executed directly
if (require.main === module) {
  main()
}