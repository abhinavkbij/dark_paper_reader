// test-suite.js - Comprehensive test suite for PDF2HTML webapp
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const API_BASE_URL = 'http://localhost/api/v1';

class PDF2HTMLTester {
  constructor() {
    this.testResults = [];
    this.axios = axios.create({
      baseURL: API_BASE_URL,
      timeout: 60000
    });
  }

  // Test result logging
  logTest(testName, success, details = '') {
    const result = {
      test: testName,
      success,
      details,
      timestamp: new Date().toISOString()
    };
    this.testResults.push(result);
    
    const status = success ? '✅' : '❌';
    console.log(`${status} ${testName}${details ? `: ${details}` : ''}`);
  }

  // Wait for job completion
  async waitForJobCompletion(jobId, maxWaitTime = 120000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitTime) {
      try {
        const response = await this.axios.get(`/jobs/${jobId}/status`);
        const job = response.data;
        
        if (job.status === 'completed') {
          return { success: true, job };
        } else if (job.status === 'failed') {
          return { success: false, job };
        }
        
        // Wait 2 seconds before next poll
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        console.warn(`Status check failed: ${error.message}`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    return { success: false, error: 'Timeout waiting for job completion' };
  }

  // Test 1: Health Check
  async testHealthCheck() {
    try {
      const response = await axios.get('http://localhost/health');
      this.logTest('Health Check', response.status === 200, `Status: ${response.status}`);
      return response.status === 200;
    } catch (error) {
      this.logTest('Health Check', false, error.message);
      return false;
    }
  }

  // Test 2: Presigned URL Generation
  async testPresignedUrl() {
    try {
      const response = await this.axios.post('/upload/presigned-url', {
        filename: 'test.pdf',
        contentType: 'application/pdf'
      });
      
      const { jobId, presignedUrl, key } = response.data;
      const isValid = jobId && presignedUrl && key;
      
      this.logTest('Presigned URL Generation', isValid, `JobId: ${jobId}`);
      return isValid ? { jobId, presignedUrl, key } : null;
    } catch (error) {
      this.logTest('Presigned URL Generation', false, error.message);
      return null;
    }
  }

  // Test 3: File Upload Simulation
  async testFileUpload() {
    try {
      // First get presigned URL
      const urlData = await this.testPresignedUrl();
      if (!urlData) return false;

      // Create a simple PDF buffer for testing (this is a minimal PDF structure)
      const testPdfContent = `%PDF-1.4
1 0 obj
<<
/Type /Catalog
/Pages 2 0 R
>>
endobj

2 0 obj
<<
/Type /Pages
/Kids [3 0 R]
/Count 1
>>
endobj

3 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
/Contents 4 0 R
>>
endobj

4 0 obj
<<
/Length 44
>>
stream
BT
/F1 12 Tf
100 700 Td
(Hello World!) Tj
ET
endstream
endobj

xref
0 5
0000000000 65535 f 
0000000010 00000 n 
0000000079 00000 n 
0000000136 00000 n 
0000000229 00000 n 
trailer
<<
/Size 5
/Root 1 0 R
>>
startxref
324
%%EOF`;

      // Upload to presigned URL
      const uploadResponse = await axios.put(urlData.presignedUrl, testPdfContent, {
        headers: { 'Content-Type': 'application/pdf' }
      });

      if (uploadResponse.status !== 200) {
        this.logTest('File Upload', false, `Upload failed: ${uploadResponse.status}`);
        return false;
      }

      // Start conversion
      const conversionResponse = await this.axios.post('/convert/upload', {
        jobId: urlData.jobId,
        key: urlData.key,
        filename: 'test.pdf'
      });

      const conversionSuccess = conversionResponse.status === 200;
      this.logTest('File Upload & Conversion Start', conversionSuccess, `JobId: ${urlData.jobId}`);
      
      return conversionSuccess ? urlData.jobId : null;
    } catch (error) {
      this.logTest('File Upload', false, error.message);
      return null;
    }
  }

  // Test 4: URL Conversion
  async testUrlConversion() {
    try {
      // Use a sample PDF URL (you can replace with a real PDF URL for testing)
      const testUrl = 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf';
      
      const response = await this.axios.post('/convert/url', {
        url: testUrl
      });

      const success = response.status === 200;
      const jobId = response.data.jobId;
      
      this.logTest('URL Conversion Start', success, `JobId: ${jobId}`);
      return success ? jobId : null;
    } catch (error) {
      this.logTest('URL Conversion', false, error.message);
      return null;
    }
  }

  // Test 5: Job Status Tracking
  async testJobStatusTracking(jobId) {
    try {
      const response = await this.axios.get(`/jobs/${jobId}/status`);
      const job = response.data;
      
      const hasRequiredFields = job.id && job.status && job.createdAt;
      this.logTest('Job Status Tracking', hasRequiredFields, `Status: ${job.status}`);
      
      return hasRequiredFields;
    } catch (error) {
      this.logTest('Job Status Tracking', false, error.message);
      return false;
    }
  }

  // Test 6: End-to-End Conversion
  async testEndToEndConversion() {
    try {
      console.log('\n🔄 Starting end-to-end conversion test...');
      
      // Start a conversion job
      const jobId = await this.testFileUpload();
      if (!jobId) {
        this.logTest('End-to-End Conversion', false, 'Failed to start job');
        return false;
      }

      // Wait for completion
      console.log('⏳ Waiting for conversion to complete...');
      const result = await this.waitForJobCompletion(jobId);
      
      if (!result.success) {
        this.logTest('End-to-End Conversion', false, result.error || 'Job failed');
        return false;
      }

      // Try to get the result
      const htmlResponse = await this.axios.get(`/jobs/${jobId}/result`);
      const htmlContent = htmlResponse.data;
      
      const isValidHtml = htmlContent.includes('<!DOCTYPE html>') && 
                         htmlContent.includes('<html') && 
                         htmlContent.includes('</html>');
      
      this.logTest('End-to-End Conversion', isValidHtml, 'HTML generated successfully');
      
      if (isValidHtml) {
        // Save sample output for inspection
        fs.writeFileSync('sample-output.html', htmlContent);
        console.log('📄 Sample output saved to sample-output.html');
      }
      
      return isValidHtml;
    } catch (error) {
      this.logTest('End-to-End Conversion', false, error.message);
      return false;
    }
  }

  // Test 7: Error Handling
  async testErrorHandling() {
    const tests = [
      {
        name: 'Invalid File Type',
        test: () => this.axios.post('/upload/presigned-url', {
          filename: 'test.txt',
          contentType: 'text/plain'
        }),
        expectError: true
      },
      {
        name: 'Missing Parameters',
        test: () => this.axios.post('/convert/upload', {}),
        expectError: true
      },
      {
        name: 'Invalid URL',
        test: () => this.axios.post('/convert/url', { url: 'not-a-url' }),
        expectError: true
      },
      {
        name: 'Non-existent Job',
        test: () => this.axios.get('/jobs/invalid-job-id/status'),
        expectError: true
      }
    ];

    let allPassed = true;
    
    for (const test of tests) {
      try {
        await test.test();
        // If we get here without an error and expected an error, test failed
        if (test.expectError) {
          this.logTest(test.name, false, 'Expected error but got success');
          allPassed = false;
        } else {
          this.logTest(test.name, true);
        }
      } catch (error) {
        // If we expected an error and got one, test passed
        if (test.expectError) {
          this.logTest(test.name, true, `Correctly rejected: ${error.response?.status}`);
        } else {
          this.logTest(test.name, false, error.message);
          allPassed = false;
        }
      }
    }

    return allPassed;
  }

  // Test 8: Performance Test
  async testPerformance() {
    try {
      const startTime = Date.now();
      
      // Test multiple small jobs
      const jobPromises = [];
      for (let i = 0; i < 3; i++) {
        jobPromises.push(this.testFileUpload());
      }

      const jobIds = await Promise.all(jobPromises);
      const validJobIds = jobIds.filter(id => id !== null);

      if (validJobIds.length === 0) {
        this.logTest('Performance Test', false, 'No jobs started successfully');
        return false;
      }

      // Wait for all jobs to complete
      const completionPromises = validJobIds.map(jobId => 
        this.waitForJobCompletion(jobId, 180000)
      );

      const results = await Promise.all(completionPromises);
      
      const successfulJobs = results.filter(r => r.success).length;
      const totalTime = Date.now() - startTime;
      
      const success = successfulJobs === validJobIds.length;
      this.logTest('Performance Test', success, 
        `${successfulJobs}/${validJobIds.length} jobs completed in ${totalTime}ms`);
      
      return success;
    } catch (error) {
      this.logTest('Performance Test', false, error.message);
      return false;
    }
  }

  // Run all tests
  async runAllTests() {
    console.log('🧪 Starting PDF2HTML Test Suite...\n');
    
    const tests = [
      { name: 'Health Check', fn: () => this.testHealthCheck() },
      { name: 'Presigned URL', fn: () => this.testPresignedUrl() },
      { name: 'Error Handling', fn: () => this.testErrorHandling() },
      { name: 'End-to-End Conversion', fn: () => this.testEndToEndConversion() },
      { name: 'Performance', fn: () => this.testPerformance() }
    ];

    let passedTests = 0;
    
    for (const test of tests) {
      console.log(`\n🔍 Running ${test.name} test...`);
      try {
        const result = await test.fn();
        if (result) passedTests++;
      } catch (error) {
        this.logTest(test.name, false, `Unexpected error: ${error.message}`);
      }
    }

    // Print summary
    console.log('\n📊 Test Summary:');
    console.log('='.repeat(50));
    
    this.testResults.forEach(result => {
      const status = result.success ? '✅' : '❌';
      console.log(`${status} ${result.test}${result.details ? ` - ${result.details}` : ''}`);
    });
    
    console.log('='.repeat(50));
    console.log(`\n🎯 Results: ${passedTests}/${tests.length} tests passed`);
    
    if (passedTests === tests.length) {
      console.log('🎉 All tests passed! The PDF2HTML webapp is working correctly.');
    } else {
      console.log('⚠️  Some tests failed. Check the logs above for details.');
    }

    // Save detailed results
    const reportPath = 'test-report.json';
    fs.writeFileSync(reportPath, JSON.stringify({
      summary: {
        total: tests.length,
        passed: passedTests,
        failed: tests.length - passedTests,
        timestamp: new Date().toISOString()
      },
      results: this.testResults
    }, null, 2));
    
    console.log(`\n📄 Detailed report saved to ${reportPath}`);
  }

  // Cleanup test data
  async cleanup() {
    console.log('\n🧹 Cleaning up test data...');
    // In a real implementation, you might want to delete test jobs from Redis
    // and test files from S3, but for this demo we'll just log
    this.logTest('Cleanup', true, 'Test cleanup completed');
  }
}

// Usage example and CLI interface
async function main() {
  const tester = new PDF2HTMLTester();
  
  try {
    await tester.runAllTests();
  } catch (error) {
    console.error('❌ Test suite failed:', error);
    process.exit(1);
  } finally {
    await tester.cleanup();
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
PDF2HTML Test Suite

Usage: node test-suite.js [options]

Options:
  --help, -h          Show this help message
  --health           Run only health check
  --upload           Test file upload flow
  --url              Test URL conversion flow
  --performance      Run performance tests
  --all              Run all tests (default)

Examples:
  node test-suite.js --health
  node test-suite.js --upload
  node test-suite.js --all
`);
    process.exit(0);
  }

  if (args.includes('--health')) {
    const tester = new PDF2HTMLTester();
    tester.testHealthCheck().then(result => {
      process.exit(result ? 0 : 1);
    });
  } else {
    main();
  }
}

module.exports = PDF2HTMLTester;