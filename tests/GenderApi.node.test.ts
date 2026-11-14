import { describe, expect, it } from 'vitest';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';
import { GenderApi } from '../nodes/GenderApi/GenderApi.node';
import { GenderApiComApi } from '../credentials/GenderApiComApi.credentials';
import {
	createContext,
	genderAnswer,
	PROBLEM_EMAIL_INVALID,
	PROBLEM_INVALID_AUTH_TOKEN,
	PROBLEM_LIMIT_EXCEEDED,
} from './helpers';

const node = new GenderApi();

function run(context: ReturnType<typeof createContext>['context']) {
	return node.execute.call(context);
}

describe('credential', () => {
	const credential = new GenderApiComApi();

	it('sends the token as a bearer token', () => {
		expect(credential.name).toBe('genderApiComApi');
		expect(credential.authenticate).toEqual({
			type: 'generic',
			properties: { headers: { Authorization: '=Bearer {{$credentials.apiToken}}' } },
		});
		expect(credential.properties[0]).toMatchObject({
			name: 'apiToken',
			typeOptions: { password: true },
		});
	});

	it('tests the credential against the free statistic endpoint', () => {
		expect(credential.test.request).toEqual({
			baseURL: 'https://gender-api.com/v2',
			url: '/statistic',
			method: 'GET',
		});
	});

	it('explains a rejected token, which the API answers with HTTP 400', () => {
		expect(credential.test.rules).toEqual([
			{
				type: 'responseCode',
				properties: { value: 400, message: expect.stringContaining('rejected the API token') },
			},
		]);
	});
});

describe('node description', () => {
	it('uses the credential, is usable as an AI tool and has one main input and output', () => {
		expect(node.description.credentials).toEqual([{ name: 'genderApiComApi', required: true }]);
		expect(node.description.usableAsTool).toBe(true);
		expect(node.description.inputs).toEqual(['main']);
		expect(node.description.outputs).toEqual(['main']);
	});

	it('gives every operation an action text', () => {
		const operations = node.description.properties.filter((p) => p.name === 'operation');
		const options = operations.flatMap((p) => (p.options ?? []) as Array<{ action?: string }>);

		expect(options).toHaveLength(7);
		for (const option of options) {
			expect(option.action).toMatch(/^[A-Z][a-z]/);
		}
	});
});

describe('gender lookups', () => {
	it('sends a first name with localization to the single endpoint', async () => {
		const { context, requests } = createContext({
			parameters: {
				resource: 'gender',
				operation: 'getByFirstName',
				firstName: ' Sandra ',
				additionalFields: { country: 'us', locale: 'en_US', ip: '' },
			},
			responses: [{ statusCode: 200, body: genderAnswer('Sandra', 'female') }],
		});

		const [output] = await run(context);

		expect(requests).toHaveLength(1);
		expect(requests[0].credentialType).toBe('genderApiComApi');
		expect(requests[0].options).toMatchObject({
			method: 'POST',
			url: 'https://gender-api.com/v2/gender/by-first-name',
			body: { first_name: 'Sandra', country: 'US', locale: 'en_US' },
			json: true,
			returnFullResponse: true,
			ignoreHttpStatusErrors: true,
			headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
		});
		expect(requests[0].options.body).not.toHaveProperty('ip');
		expect(output).toEqual([{ json: genderAnswer('Sandra', 'female'), pairedItem: { item: 0 } }]);
	});

	it('sends a full name to the full-name endpoint', async () => {
		const { context, requests } = createContext({
			parameters: { resource: 'gender', operation: 'getByFullName', fullName: 'Sandra Miller' },
			responses: [
				{ statusCode: 200, body: genderAnswer('Sandra', 'female', { last_name: 'Miller' }) },
			],
		});

		await run(context);

		expect(requests[0].options).toMatchObject({
			method: 'POST',
			url: 'https://gender-api.com/v2/gender/by-full-name',
			body: { full_name: 'Sandra Miller' },
		});
	});

	it('sends an email address to the email endpoint', async () => {
		const { context, requests } = createContext({
			parameters: {
				resource: 'gender',
				operation: 'getByEmailAddress',
				email: 'sandra.miller@example.com',
				additionalFields: { ip: '54.201.1.1' },
			},
			responses: [{ statusCode: 200, body: genderAnswer('Sandra', 'female') }],
		});

		await run(context);

		expect(requests[0].options).toMatchObject({
			method: 'POST',
			url: 'https://gender-api.com/v2/gender/by-email-address',
			body: { email: 'sandra.miller@example.com', ip: '54.201.1.1' },
		});
	});

	it('sends several items as one batch and maps the answers back in order', async () => {
		const names = ['Sandra', 'Mike', 'Andrea'];
		const { context, requests } = createContext({
			items: names.map((name) => ({ json: { name } })),
			parameters: (i) => ({ resource: 'gender', operation: 'getByFirstName', firstName: names[i] }),
			responses: [
				{
					statusCode: 200,
					body: [
						genderAnswer('Sandra', 'female'),
						genderAnswer('Mike', 'male'),
						genderAnswer('Andrea', 'female'),
					],
				},
			],
		});

		const [output] = await run(context);

		expect(requests).toHaveLength(1);
		expect(requests[0].options).toMatchObject({
			url: 'https://gender-api.com/v2/gender/by-first-name-multiple',
			body: [{ first_name: 'Sandra' }, { first_name: 'Mike' }, { first_name: 'Andrea' }],
		});
		expect(output.map((item) => item.json.gender)).toEqual(['female', 'male', 'female']);
		expect(output.map((item) => item.pairedItem)).toEqual([{ item: 0 }, { item: 1 }, { item: 2 }]);
	});

	it('splits the items by the batch size option', async () => {
		const names = ['Sandra', 'Mike', 'Andrea'];
		const { context, requests } = createContext({
			items: names.map((name) => ({ json: { name } })),
			parameters: (i) => ({
				resource: 'gender',
				operation: 'getByFirstName',
				firstName: names[i],
				options: { batchSize: 2 },
			}),
			responses: [
				{ statusCode: 200, body: [genderAnswer('Sandra', 'female'), genderAnswer('Mike', 'male')] },
				{ statusCode: 200, body: genderAnswer('Andrea', 'female') },
			],
		});

		const [output] = await run(context);

		expect(requests.map((r) => r.options.url)).toEqual([
			'https://gender-api.com/v2/gender/by-first-name-multiple',
			'https://gender-api.com/v2/gender/by-first-name',
		]);
		expect(requests[1].options.body).toEqual({ first_name: 'Andrea' });
		expect(output).toHaveLength(3);
	});

	it('caps the batch size at 100 names per request', async () => {
		const count = 150;
		const { context, requests } = createContext({
			items: Array.from({ length: count }, () => ({ json: {} })),
			parameters: {
				resource: 'gender',
				operation: 'getByFirstName',
				firstName: 'Sandra',
				options: { batchSize: 500 },
			},
			responses: [
				{
					statusCode: 200,
					body: Array.from({ length: 100 }, () => genderAnswer('Sandra', 'female')),
				},
				{
					statusCode: 200,
					body: Array.from({ length: 50 }, () => genderAnswer('Sandra', 'female')),
				},
			],
		});

		const [output] = await run(context);

		expect((requests[0].options.body as unknown[]).length).toBe(100);
		expect((requests[1].options.body as unknown[]).length).toBe(50);
		expect(output).toHaveLength(count);
	});

	it('writes the answer into a field of the input item when asked to', async () => {
		const { context } = createContext({
			items: [{ json: { id: 7, name: 'Sandra' } }],
			parameters: {
				resource: 'gender',
				operation: 'getByFirstName',
				firstName: 'Sandra',
				options: { resultField: 'genderApi' },
			},
			responses: [{ statusCode: 200, body: genderAnswer('Sandra', 'female') }],
		});

		const [output] = await run(context);

		expect(output[0].json).toEqual({
			id: 7,
			name: 'Sandra',
			genderApi: genderAnswer('Sandra', 'female'),
		});
	});

	it('fails a batch entry that the API rejects, with the API message and item index', async () => {
		const emails = ['sandra@example.com', 'not-an-email'];
		const { context } = createContext({
			items: emails.map((email) => ({ json: { email } })),
			parameters: (i) => ({ resource: 'gender', operation: 'getByEmailAddress', email: emails[i] }),
			responses: [
				{ statusCode: 200, body: [genderAnswer('Sandra', 'female'), PROBLEM_EMAIL_INVALID] },
			],
		});

		const error = await run(context).catch((e: unknown) => e);

		expect(error).toBeInstanceOf(NodeApiError);
		expect((error as NodeApiError).message).toBe(PROBLEM_EMAIL_INVALID.detail);
		expect((error as NodeApiError).httpCode).toBe('400');
		expect((error as NodeApiError).context.itemIndex).toBe(1);
	});

	it('keeps the good batch entries and outputs an error item for the rejected one on Continue On Fail', async () => {
		const emails = ['sandra@example.com', 'not-an-email'];
		const { context } = createContext({
			items: emails.map((email) => ({ json: { email } })),
			parameters: (i) => ({ resource: 'gender', operation: 'getByEmailAddress', email: emails[i] }),
			responses: [
				{ statusCode: 200, body: [genderAnswer('Sandra', 'female'), PROBLEM_EMAIL_INVALID] },
			],
			continueOnFail: true,
		});

		const [output] = await run(context);

		expect(output[0].json.gender).toBe('female');
		expect(output[1]).toEqual({
			json: {
				error: PROBLEM_EMAIL_INVALID.detail,
				code: 'parameter-email-invalid',
				httpCode: '400',
			},
			pairedItem: { item: 1 },
		});
	});

	it('stops before any request when a name is empty', async () => {
		const names = ['Sandra', ''];
		const { context, requests } = createContext({
			items: names.map(() => ({ json: {} })),
			parameters: (i) => ({ resource: 'gender', operation: 'getByFirstName', firstName: names[i] }),
		});

		const error = await run(context).catch((e: unknown) => e);

		expect(error).toBeInstanceOf(NodeOperationError);
		expect((error as NodeOperationError).message).toBe("'First Name' is empty");
		expect((error as NodeOperationError).context.itemIndex).toBe(1);
		expect(requests).toHaveLength(0);
	});

	it('skips an empty name on Continue On Fail and still looks up the others', async () => {
		const names = ['', 'Mike'];
		const { context, requests } = createContext({
			items: names.map(() => ({ json: {} })),
			parameters: (i) => ({ resource: 'gender', operation: 'getByFirstName', firstName: names[i] }),
			responses: [{ statusCode: 200, body: genderAnswer('Mike', 'male') }],
			continueOnFail: true,
		});

		const [output] = await run(context);

		expect(requests).toHaveLength(1);
		expect(requests[0].options.body).toEqual({ first_name: 'Mike' });
		expect(output[0]).toMatchObject({
			json: { error: "'First Name' is empty" },
			pairedItem: { item: 0 },
		});
		expect(output[1]).toMatchObject({ json: { gender: 'male' }, pairedItem: { item: 1 } });
	});
});

describe('API errors', () => {
	it('turns limit-exceeded into a NodeApiError with the upgrade link', async () => {
		const { context } = createContext({
			parameters: { resource: 'gender', operation: 'getByFirstName', firstName: 'Sandra' },
			responses: [{ statusCode: 401, body: PROBLEM_LIMIT_EXCEEDED }],
		});

		const error = (await run(context).catch((e: unknown) => e)) as NodeApiError;

		expect(error).toBeInstanceOf(NodeApiError);
		expect(error.message).toBe(
			'Your Gender-API account has no credits left, so retrying will not help. Buy more credits at https://gender-api.com/en/pricing?from=api-limit',
		);
		expect(error.description).toBe(PROBLEM_LIMIT_EXCEEDED.detail);
		expect(error.httpCode).toBe('401');
		expect(error.context.itemIndex).toBe(0);
		expect(error.context.apiCode).toBe('limit-exceeded');
	});

	it('marks every item of a rejected batch as failed on Continue On Fail', async () => {
		const { context } = createContext({
			items: [{ json: {} }, { json: {} }],
			parameters: { resource: 'gender', operation: 'getByFirstName', firstName: 'Sandra' },
			responses: [{ statusCode: 400, body: PROBLEM_INVALID_AUTH_TOKEN }],
			continueOnFail: true,
		});

		const [output] = await run(context);

		const expected = {
			error:
				'Gender-API rejected the API token. Check that the token in the credential is valid and active.',
			description: PROBLEM_INVALID_AUTH_TOKEN.detail,
			code: 'invalid-auth-token',
			httpCode: '400',
		};
		expect(output).toEqual([
			{ json: expected, pairedItem: { item: 0 } },
			{ json: expected, pairedItem: { item: 1 } },
		]);
	});

	it('reports an answer that is not JSON', async () => {
		const { context } = createContext({
			parameters: { resource: 'account', operation: 'getStatistics' },
			responses: [{ statusCode: 502, body: '<html>Bad Gateway</html>' }],
		});

		const error = (await run(context).catch((e: unknown) => e)) as NodeApiError;

		expect(error).toBeInstanceOf(NodeApiError);
		expect(error.message).toBe('Gender-API answered with HTTP status 502.');
		expect(error.httpCode).toBe('502');
	});

	it('wraps a network failure in a NodeApiError', async () => {
		const networkError = Object.assign(new Error('getaddrinfo ENOTFOUND gender-api.com'), {
			code: 'ENOTFOUND',
		});
		const { context } = createContext({
			parameters: { resource: 'account', operation: 'getStatistics' },
			responses: [networkError],
		});

		const error = (await run(context).catch((e: unknown) => e)) as NodeApiError;

		expect(error).toBeInstanceOf(NodeApiError);
		expect(error.context.itemIndex).toBe(0);
	});
});

describe('country of origin', () => {
	it('sends one request per item to /country-of-origin without localization fields', async () => {
		const answer = {
			input: { first_name: 'Johanna' },
			details: {
				credits_used: 2,
				duration: '210ms',
				samples: 3826,
				country: null,
				first_name_sanitized: 'johanna',
			},
			result_found: true,
			country_of_origin: [
				{
					country_name: 'Germany',
					country: 'DE',
					probability: 0.53,
					continental_region: 'Europe',
					statistical_region: 'Western Europe',
				},
			],
			country_of_origin_map_url: 'https://gender-api.com/en/map/7/f43185621c3e4c9c',
			first_name: 'Johanna',
			probability: 0.99,
			gender: 'female',
		};
		const names = ['Johanna', 'Mike'];
		const { context, requests } = createContext({
			items: names.map(() => ({ json: {} })),
			parameters: (i) => ({
				resource: 'countryOfOrigin',
				operation: 'getByFirstName',
				firstName: names[i],
			}),
			responses: [
				{ statusCode: 200, body: answer },
				{ statusCode: 200, body: { ...answer, first_name: 'Mike' } },
			],
		});

		const [output] = await run(context);

		expect(requests.map((r) => [r.options.method, r.options.url, r.options.body])).toEqual([
			['POST', 'https://gender-api.com/v2/country-of-origin', { first_name: 'Johanna' }],
			['POST', 'https://gender-api.com/v2/country-of-origin', { first_name: 'Mike' }],
		]);
		expect(output[0]).toEqual({ json: answer, pairedItem: { item: 0 } });
	});

	it('sends a full name and an email address in their own fields', async () => {
		const { context, requests } = createContext({
			items: [{ json: {} }],
			parameters: {
				resource: 'countryOfOrigin',
				operation: 'getByEmailAddress',
				email: 'johanna@example.com',
			},
			responses: [{ statusCode: 200, body: { result_found: false } }],
		});

		await run(context);

		expect(requests[0].options.body).toEqual({ email: 'johanna@example.com' });
	});

	it('continues with the next item after a failed one on Continue On Fail', async () => {
		const { context } = createContext({
			items: [{ json: {} }, { json: {} }],
			parameters: {
				resource: 'countryOfOrigin',
				operation: 'getByFullName',
				fullName: 'Johanna Schmidt',
			},
			responses: [
				{ statusCode: 401, body: PROBLEM_LIMIT_EXCEEDED },
				{ statusCode: 200, body: { result_found: true, first_name: 'Johanna' } },
			],
			continueOnFail: true,
		});

		const [output] = await run(context);

		expect(output[0].json).toMatchObject({ code: 'limit-exceeded', httpCode: '401' });
		expect(output[1].json).toEqual({ result_found: true, first_name: 'Johanna' });
	});
});

describe('account statistics', () => {
	it('reads the remaining credits with GET /statistic', async () => {
		const answer = {
			is_limit_reached: false,
			remaining_credits: 23456,
			details: { credits_used: 0, duration: '32ms' },
			usage_last_month: { date: '2026-10', credits_used: 30446 },
		};
		const { context, requests } = createContext({
			parameters: { resource: 'account', operation: 'getStatistics' },
			responses: [{ statusCode: 200, body: answer }],
		});

		const [output] = await run(context);

		expect(requests[0].options).toMatchObject({
			method: 'GET',
			url: 'https://gender-api.com/v2/statistic',
		});
		expect(requests[0].options.body).toBeUndefined();
		expect(output).toEqual([{ json: answer, pairedItem: { item: 0 } }]);
	});
});
