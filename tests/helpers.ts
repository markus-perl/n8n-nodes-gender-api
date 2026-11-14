import { vi } from 'vitest';
import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestOptions,
	INode,
	INodeExecutionData,
} from 'n8n-workflow';

export interface RecordedRequest {
	credentialType: string;
	options: IHttpRequestOptions;
}

/** A canned HTTP answer, shaped like n8n's full response (returnFullResponse: true). */
export interface FakeResponse {
	statusCode: number;
	body: unknown;
}

export interface ContextOptions {
	items?: INodeExecutionData[];
	/** Node parameters, either the same for every item or computed per item index. */
	parameters: IDataObject | ((itemIndex: number) => IDataObject);
	responses?: Array<FakeResponse | Error>;
	continueOnFail?: boolean;
}

const node: INode = {
	id: 'b3f3c0de-0000-4000-8000-000000000001',
	name: 'Gender-API',
	type: '@gender-api/n8n-nodes-gender-api.genderApi',
	typeVersion: 1,
	position: [0, 0],
	parameters: {},
};

function readPath(source: IDataObject, path: string): unknown {
	return path.split('.').reduce<unknown>((value, key) => {
		if (value && typeof value === 'object' && key in (value as IDataObject)) {
			return (value as IDataObject)[key];
		}

		return undefined;
	}, source);
}

/**
 * A minimal stand-in for n8n's IExecuteFunctions: enough for the node's execute()
 * to run, with every HTTP request recorded and answered from `responses` in order.
 */
export function createContext(options: ContextOptions) {
	const items = options.items ?? [{ json: {} }];
	const responses = [...(options.responses ?? [])];
	const requests: RecordedRequest[] = [];

	const httpRequestWithAuthentication = vi.fn(
		async (credentialType: string, requestOptions: IHttpRequestOptions) => {
			requests.push({ credentialType, options: requestOptions });
			const next = responses.shift();

			if (next === undefined) {
				throw new Error(`Unexpected request to ${requestOptions.url}`);
			}

			if (next instanceof Error) {
				throw next;
			}

			return { headers: {}, ...next };
		},
	);

	const context = {
		getInputData: () => items,
		getNode: () => node,
		continueOnFail: () => options.continueOnFail ?? false,
		getNodeParameter: (name: string, itemIndex: number, fallback?: unknown) => {
			const parameters =
				typeof options.parameters === 'function'
					? options.parameters(itemIndex)
					: options.parameters;
			const value = readPath(parameters, name);

			if (value !== undefined) {
				return value;
			}

			if (fallback !== undefined) {
				return fallback;
			}

			throw new Error(`Missing node parameter "${name}"`);
		},
		helpers: {
			httpRequestWithAuthentication,
		},
	};

	return {
		context: context as unknown as IExecuteFunctions,
		requests,
		httpRequestWithAuthentication,
	};
}

/** Real answers of the production API, captured on 2026-11-14 with an invalid token. */
export const PROBLEM_INVALID_AUTH_TOKEN = {
	status: 400,
	type: 'https://gender-api.com/en/api-docs/v2/problem-details/invalid-auth-token',
	title: 'invalid-auth-token',
	detail:
		'Invalid authentication token provided. Please log in to your account to find a list of valid tokens or to create a new one.',
};

/**
 * Shape taken from ApiV2\Model\ProblemDetailsResponseFactory and the OpenAPI spec
 * (LimitExceededModel). Not captured live: that needs an account without credits.
 */
export const PROBLEM_LIMIT_EXCEEDED = {
	status: 401,
	type: 'https://gender-api.com/en/api-docs/v2/problem-details/limit-exceeded',
	title: 'limit-exceeded',
	detail:
		'Your account has no requests left. This is not an authentication error, and retrying will not help. Buy more requests at https://gender-api.com/en/pricing?from=api-limit',
	upgrade_url: 'https://gender-api.com/en/pricing?from=api-limit',
};

/** A per-entry validation answer inside a batch (ProblemDetailsResponseFactory). */
export const PROBLEM_EMAIL_INVALID = {
	input: { email: 'not-an-email' },
	status: 400,
	type: 'https://gender-api.com/en/api-docs/v2/problem-details/parameter-email-invalid',
	title: 'parameter-email-invalid',
	detail:
		'The "email" parameter is invalid. The parameter can only be a string with a length from 3 to 100 chars and must be a valid email address.',
};

/** Success shapes from public/openapi/openapi.yml (FirstNameResultModelMultiple example). */
export function genderAnswer(firstName: string, gender: string, extra: IDataObject = {}) {
	return {
		input: { first_name: firstName.toLowerCase() },
		details: {
			credits_used: 1,
			duration: '72ms',
			samples: 70,
			country: null,
			first_name_sanitized: firstName.toLowerCase(),
		},
		result_found: true,
		first_name: firstName,
		probability: 0.98,
		gender,
		...extra,
	};
}
