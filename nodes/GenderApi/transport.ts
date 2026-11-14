import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	IN8nHttpFullResponse,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';

export const BASE_URL = 'https://gender-api.com/v2';
export const CREDENTIAL_TYPE = 'genderApiComApi';
export const DEFAULT_UPGRADE_URL = 'https://gender-api.com/en/pricing?from=api-limit';

/** The API accepts at most this many lookups in one request (ApiV2 GenderController). */
export const MAX_BATCH_SIZE = 100;

export type ApiBody = IDataObject | IDataObject[];

/**
 * An RFC 7807 problem-details object as Gender-API v2 sends it. `title` carries the
 * machine-readable code (for example "limit-exceeded"), `detail` the prose.
 */
export interface ProblemDetails extends IDataObject {
	status: number;
	title: string;
	detail?: string;
	type?: string;
	upgrade_url?: string;
}

export function isProblemDetails(value: unknown): value is ProblemDetails {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return false;
	}

	const candidate = value as IDataObject;

	return (
		typeof candidate.status === 'number' &&
		typeof candidate.title === 'string' &&
		!('result_found' in candidate)
	);
}

function extractUpgradeUrl(problem: ProblemDetails): string {
	if (typeof problem.upgrade_url === 'string' && /^https?:\/\/\S+$/.test(problem.upgrade_url)) {
		return problem.upgrade_url;
	}

	return DEFAULT_UPGRADE_URL;
}

/**
 * Turns the API's problem code into a message that says what happened and what to do.
 * Mirrors the mapping of the Gender-API MCP server (mcp-server/src/client/genderApiClient.ts).
 */
export function describeProblem(problem: ProblemDetails): string {
	switch (problem.title) {
		case 'authorization-header-missing':
			return 'Gender-API received no API token. Select a Gender-API.com API credential on the node.';
		case 'invalid-auth-token':
			return 'Gender-API rejected the API token. Check that the token in the credential is valid and active.';
		case 'limit-exceeded':
			return `Your Gender-API account has no credits left, so retrying will not help. Buy more credits at ${extractUpgradeUrl(problem)}`;
		case 'rate-limit-reached':
			return 'Gender-API rate limited this request. Retry after a short delay.';
		case 'too-many-queries':
			return `Gender-API accepts at most ${MAX_BATCH_SIZE} lookups per request. Lower the 'Batch Size' option.`;
		default:
			if (typeof problem.detail === 'string' && problem.detail.trim() !== '') {
				return problem.detail;
			}

			return `Gender-API answered with status ${problem.status} (${problem.title}).`;
	}
}

/** Builds the NodeApiError for a problem-details object, keeping the API's own detail text. */
export function problemToNodeApiError(
	this: IExecuteFunctions,
	problem: ProblemDetails,
	itemIndex: number,
): NodeApiError {
	const message = describeProblem(problem);
	const detail = typeof problem.detail === 'string' ? problem.detail.trim() : '';

	const error = new NodeApiError(this.getNode(), problem as JsonObject, {
		message,
		description: detail !== '' && detail !== message ? detail : undefined,
		httpCode: String(problem.status),
		itemIndex,
	});

	// Keep the machine-readable code ("limit-exceeded", ...) so a "Continue On Fail"
	// item can carry it and a workflow can branch on it.
	error.context.apiCode = problem.title;

	return error;
}

/**
 * Sends one request to Gender-API v2 and returns the parsed JSON body.
 * Every answer with a status of 400 or higher becomes a NodeApiError that carries the
 * API's own message, because the API answers auth, credit and validation problems
 * with a problem-details body.
 */
export async function genderApiRequest(
	this: IExecuteFunctions,
	method: IHttpRequestMethods,
	path: string,
	itemIndex: number,
	body?: ApiBody,
): Promise<unknown> {
	const options: IHttpRequestOptions = {
		method,
		url: `${BASE_URL}${path}`,
		headers: {
			Accept: 'application/json',
		},
		json: true,
		returnFullResponse: true,
		ignoreHttpStatusErrors: true,
	};

	if (body !== undefined) {
		options.body = body;
		options.headers = { ...options.headers, 'Content-Type': 'application/json' };
	}

	let response: IN8nHttpFullResponse;

	try {
		response = (await this.helpers.httpRequestWithAuthentication.call(
			this,
			CREDENTIAL_TYPE,
			options,
		)) as IN8nHttpFullResponse;
	} catch (error) {
		// Network failure, timeout, or a credential that could not be resolved.
		throw new NodeApiError(this.getNode(), error as JsonObject, { itemIndex });
	}

	const responseBody = parseBody(response.body);

	if (response.statusCode >= 400) {
		if (isProblemDetails(responseBody)) {
			throw problemToNodeApiError.call(this, responseBody, itemIndex);
		}

		const raw = typeof response.body === 'string' ? response.body.slice(0, 300) : undefined;

		throw new NodeApiError(
			this.getNode(),
			{ statusCode: response.statusCode, body: raw ?? null } as JsonObject,
			{
				message: `Gender-API answered with HTTP status ${response.statusCode}.`,
				description: raw,
				httpCode: String(response.statusCode),
				itemIndex,
			},
		);
	}

	if (responseBody === undefined || typeof responseBody !== 'object') {
		throw new NodeApiError(this.getNode(), { statusCode: response.statusCode } as JsonObject, {
			message: 'Gender-API returned an answer that is not JSON.',
			httpCode: String(response.statusCode),
			itemIndex,
		});
	}

	return responseBody;
}

/**
 * Errors this node raises are already NodeApiError or NodeOperationError and carry
 * their item index; anything else gets wrapped so n8n can show it on the right item.
 */
export function toNodeError(
	this: IExecuteFunctions,
	error: unknown,
	itemIndex: number,
): NodeApiError | NodeOperationError {
	if (error instanceof NodeApiError || error instanceof NodeOperationError) {
		return error;
	}

	return new NodeOperationError(this.getNode(), error as Error, { itemIndex });
}

function parseBody(body: unknown): unknown {
	if (typeof body !== 'string') {
		return body;
	}

	if (body.trim() === '') {
		return undefined;
	}

	try {
		return JSON.parse(body) as unknown;
	} catch {
		return body;
	}
}
