import * as assert from 'assert';
import { requestExplicitApproval } from '../launcher/approvalPrompt';

suite('Approval Prompt', () => {
    test('offers only Approve and treats dismissal as cancellation', async () => {
        let actions: string[] = [];
        const dismiss = await requestExplicitApproval('Preview', async (_message, _options, approve) => {
            actions = [approve];
            return undefined;
        });
        assert.strictEqual(dismiss, false);
        assert.deepStrictEqual(actions, ['Approve']);
    });

    test('accepts only the explicit Approve action', async () => {
        assert.strictEqual(await requestExplicitApproval('Preview', async () => 'Approve'), true);
        assert.strictEqual(await requestExplicitApproval('Preview', async () => 'Cancel'), false);
    });
});
