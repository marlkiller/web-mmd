import { Page, TestInfo, expect } from '@playwright/test';
import { test } from './fixtures/common';

async function playToTime(page: Page, testInfo: TestInfo, time: number) {
    let prevTime = 0.0
    await expect(async () => {
        const currentTime = await page.evaluate('vjplayer.currentTime()') as number
        if(await page.evaluate('vjplayer.paused()')) {
            await page.keyboard.down(" ")
        }
        prevTime = currentTime
        console.log(`[${testInfo.titlePath}] currentTime: ${currentTime}`)
        expect(currentTime).toBeGreaterThan(time)
    }).toPass()
    await expect(async () => {
        await page.keyboard.down(" ")
        const paused = await page.evaluate('vjplayer.paused()')
        expect(paused).toBeTruthy()
    }).toPass()
}

test("create beat", async ({ page }, testInfo) => {
    await page.getByLabel("camera mode").selectOption({ label: "Composition" })
    
    // fix video.ts-youtube bouncing
    await playToTime(page, testInfo, 0.0)

    await playToTime(page, testInfo, 3)
    await page.keyboard.down("a")
    await page.keyboard.down("a")
    await expect(page.getByText("1A", { exact: true })).toHaveCount(1)

    // ensure video.ts-youtube not bouncing
    expect(await page.evaluate('vjplayer.currentTime()')).toBeGreaterThan(3)
})

test("delete beat", async ({ page }) => {
    await page.getByLabel("camera mode").selectOption({ label: "Composition" })

    await expect(page.getByText("1A", { exact: true })).toBeAttached()
    await page.keyboard.down("Delete")
    await expect(page.getByText("1A", { exact: true })).not.toBeAttached()
})

test("cut jumping using Arrow keys", async ({ page }, testInfo) => {

    await page.getByLabel("camera mode").selectOption({ label: "Composition" })

    // fix video.ts-youtube bouncing
    await playToTime(page, testInfo, 0.0)

    await expect(async () => {
        await page.keyboard.down("ArrowLeft")
        await expect(page.getByText("1A", { exact: true })).toHaveClass(/goal/)
    }).toPass()

    await page.keyboard.down("ArrowRight")
    await expect(page.getByText("1B", { exact: true })).toHaveClass(/goal/)
})
