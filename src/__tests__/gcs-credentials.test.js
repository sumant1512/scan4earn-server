const fs = require('fs');
const path = require('path');

describe('GCS credential resolution', () => {
  it('uses the checked-in service account JSON when credentials are not exported', () => {
    const serviceAccountPath = path.resolve(__dirname, '../../image-upload-service-account.json');
    expect(fs.existsSync(serviceAccountPath)).toBe(true);

    const credentialJson = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    expect(credentialJson.type).toBe('service_account');
    expect(credentialJson.project_id).toBeTruthy();
  });
});
