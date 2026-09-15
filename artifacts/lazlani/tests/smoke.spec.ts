import { expect, test } from '@playwright/test';

test.describe('LAZLANI mobil navigasyon smoke akışı', () => {
  test('uygulama açılır, ana sekmeler ve özel yazma düğmesi çalışır', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByPlaceholder('ornek@email.com')).toBeVisible();
    await page.getByPlaceholder('ornek@email.com').fill('ayse@example.com');
    await page.getByPlaceholder('••••••••').fill('123456');
    await page.getByText('Giriş Yap', { exact: true }).click();

    await expect(page.locator('[data-testid="screen-home"]')).toBeVisible();
    await expect(page.getByText('LAZLANİ ÖNERİLERİ')).toBeVisible();

    const tabs = [
      { id: 'messages', screen: 'screen-messages' },
      { id: 'library', screen: 'screen-library' },
      { id: 'profile', screen: 'screen-profile' },
      { id: 'index', screen: 'screen-home' },
    ];

    for (const tab of tabs) {
      await page.locator(`[data-testid="tab-${tab.id}"]`).click();
      await expect(page.locator(`[data-testid="${tab.screen}"]`)).toBeVisible();
    }

    await page.locator('[data-testid="tab-write"]').click();
    await expect(page.getByText('Yeni Eser', { exact: true })).toBeVisible();
    await expect(page.getByText('Ne yazmak istiyorsun?', { exact: true })).toBeVisible();
  });
});