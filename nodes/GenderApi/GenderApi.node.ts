import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import {
	accountOperationProperty,
	countryOfOriginOperationProperty,
	countryOfOriginOptionsProperty,
	genderAdditionalFieldsProperty,
	genderOperationProperty,
	genderOptionsProperty,
	nameProperties,
	resourceProperty,
} from './descriptions';
import {
	genderApiRequest,
	isProblemDetails,
	MAX_BATCH_SIZE,
	problemToNodeApiError,
	toNodeError,
} from './transport';

type LookupOperation = 'getByFirstName' | 'getByFullName' | 'getByEmailAddress';

const LOOKUP_FIELDS: Record<
	LookupOperation,
	{ parameter: string; apiField: string; label: string }
> = {
	getByFirstName: { parameter: 'firstName', apiField: 'first_name', label: 'First Name' },
	getByFullName: { parameter: 'fullName', apiField: 'full_name', label: 'Full Name' },
	getByEmailAddress: { parameter: 'email', apiField: 'email', label: 'Email Address' },
};

const GENDER_PATHS: Record<LookupOperation, { single: string; multiple: string }> = {
	getByFirstName: { single: '/gender/by-first-name', multiple: '/gender/by-first-name-multiple' },
	getByFullName: { single: '/gender/by-full-name', multiple: '/gender/by-full-name-multiple' },
	getByEmailAddress: {
		single: '/gender/by-email-address',
		multiple: '/gender/by-email-address-multiple',
	},
};

function isLookupOperation(operation: string): operation is LookupOperation {
	return Object.prototype.hasOwnProperty.call(LOOKUP_FIELDS, operation);
}

export class GenderApi implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Gender-API',
		name: 'genderApi',
		icon: {
			light: 'file:../../icons/gender-api.svg',
			dark: 'file:../../icons/gender-api.dark.svg',
		},
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description:
			'Determine gender and country of origin from first names, full names and email addresses with Gender-API.com',
		defaults: {
			name: 'Gender-API',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'genderApiComApi',
				required: true,
			},
		],
		properties: [
			resourceProperty,
			genderOperationProperty,
			countryOfOriginOperationProperty,
			accountOperationProperty,
			...nameProperties,
			genderAdditionalFieldsProperty,
			genderOptionsProperty,
			countryOfOriginOptionsProperty,
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const resource = this.getNodeParameter('resource', 0) as string;
		const operation = this.getNodeParameter('operation', 0) as string;

		if (resource === 'gender' && isLookupOperation(operation)) {
			return [await executeGenderLookups.call(this, items, operation)];
		}

		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				if (resource === 'countryOfOrigin' && isLookupOperation(operation)) {
					const body = buildLookupBody.call(this, operation, i, false);
					const answer = (await genderApiRequest.call(
						this,
						'POST',
						'/country-of-origin',
						i,
						body,
					)) as IDataObject;
					returnData.push(toOutputItem.call(this, items[i], answer, i));
				} else if (resource === 'account' && operation === 'getStatistics') {
					const answer = (await genderApiRequest.call(this, 'GET', '/statistic', i)) as IDataObject;
					returnData.push({ json: answer, pairedItem: { item: i } });
				} else {
					throw new NodeOperationError(
						this.getNode(),
						`The operation "${operation}" is not supported for the resource "${resource}"`,
						{ itemIndex: i },
					);
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push(toErrorItem(error as Error, i));
					continue;
				}

				throw toNodeError.call(this, error, i);
			}
		}

		return [returnData];
	}
}

/**
 * Gender lookups go out in batches: Gender-API takes up to 100 names in one request,
 * so a list of 10,000 names needs 100 requests instead of 10,000. A batch answers
 * with one entry per name, in request order; an invalid entry comes back as a
 * problem-details object in its slot while the other names still resolve.
 */
async function executeGenderLookups(
	this: IExecuteFunctions,
	items: INodeExecutionData[],
	operation: LookupOperation,
): Promise<INodeExecutionData[]> {
	const results: Array<INodeExecutionData | undefined> = new Array(items.length);
	const pending: Array<{ index: number; body: IDataObject }> = [];

	// Validate every item first, so an empty name further down the list stops the run
	// before any credits are spent.
	for (let i = 0; i < items.length; i++) {
		try {
			pending.push({ index: i, body: buildLookupBody.call(this, operation, i, true) });
		} catch (error) {
			if (this.continueOnFail()) {
				results[i] = toErrorItem(error as Error, i);
				continue;
			}

			throw toNodeError.call(this, error, i);
		}
	}

	const batchSize = readBatchSize.call(this);
	const paths = GENDER_PATHS[operation];

	for (let start = 0; start < pending.length; start += batchSize) {
		const chunk = pending.slice(start, start + batchSize);
		const firstIndex = chunk[0].index;
		let answers: unknown[];

		try {
			if (chunk.length === 1) {
				answers = [
					await genderApiRequest.call(this, 'POST', paths.single, firstIndex, chunk[0].body),
				];
			} else {
				const answer = await genderApiRequest.call(
					this,
					'POST',
					paths.multiple,
					firstIndex,
					chunk.map((entry) => entry.body),
				);

				if (!Array.isArray(answer) || answer.length !== chunk.length) {
					throw new NodeApiError(this.getNode(), { expected: chunk.length } as JsonObject, {
						message: `Gender-API answered a batch of ${chunk.length} names with an unexpected result. Set the 'Batch Size' option to 1 to send one name per request.`,
						itemIndex: firstIndex,
					});
				}

				answers = answer;
			}
		} catch (error) {
			if (this.continueOnFail()) {
				for (const entry of chunk) {
					results[entry.index] = toErrorItem(error as Error, entry.index);
				}
				continue;
			}

			throw toNodeError.call(this, error, firstIndex);
		}

		chunk.forEach((entry, position) => {
			const answer = answers[position];

			if (isProblemDetails(answer)) {
				const error = problemToNodeApiError.call(this, answer, entry.index);

				if (!this.continueOnFail()) {
					throw error;
				}

				results[entry.index] = toErrorItem(error, entry.index);
				return;
			}

			results[entry.index] = toOutputItem.call(
				this,
				items[entry.index],
				(answer ?? {}) as IDataObject,
				entry.index,
			);
		});
	}

	return results.filter((result): result is INodeExecutionData => result !== undefined);
}

function readBatchSize(this: IExecuteFunctions): number {
	const value = Number(this.getNodeParameter('options.batchSize', 0, MAX_BATCH_SIZE));

	if (!Number.isFinite(value)) {
		return MAX_BATCH_SIZE;
	}

	return Math.min(MAX_BATCH_SIZE, Math.max(1, Math.floor(value)));
}

function buildLookupBody(
	this: IExecuteFunctions,
	operation: LookupOperation,
	itemIndex: number,
	withLocalization: boolean,
): IDataObject {
	const field = LOOKUP_FIELDS[operation];
	const value = String(this.getNodeParameter(field.parameter, itemIndex, '') ?? '').trim();

	if (value === '') {
		throw new NodeOperationError(this.getNode(), `'${field.label}' is empty`, {
			itemIndex,
			description: `Enter a value for '${field.label}', or map a field of the input item that contains one.`,
		});
	}

	const body: IDataObject = { [field.apiField]: value };

	if (withLocalization) {
		const additionalFields = this.getNodeParameter('additionalFields', itemIndex, {}) as {
			country?: string;
			ip?: string;
			locale?: string;
		};

		for (const key of ['country', 'ip', 'locale'] as const) {
			const fieldValue = String(additionalFields[key] ?? '').trim();

			if (fieldValue !== '') {
				body[key] = key === 'country' ? fieldValue.toUpperCase() : fieldValue;
			}
		}
	}

	return body;
}

function toOutputItem(
	this: IExecuteFunctions,
	item: INodeExecutionData,
	answer: IDataObject,
	itemIndex: number,
): INodeExecutionData {
	const resultField = String(
		this.getNodeParameter('options.resultField', itemIndex, '') ?? '',
	).trim();

	if (resultField === '') {
		return { json: answer, pairedItem: { item: itemIndex } };
	}

	return {
		json: { ...item.json, [resultField]: answer },
		pairedItem: { item: itemIndex },
	};
}

function toErrorItem(error: Error, itemIndex: number): INodeExecutionData {
	const json: IDataObject = { error: error.message };
	const description = (error as { description?: unknown }).description;
	const httpCode = (error as { httpCode?: unknown }).httpCode;
	const apiCode = (error as { context?: IDataObject }).context?.apiCode;

	if (typeof description === 'string' && description !== '') {
		json.description = description;
	}

	if (typeof apiCode === 'string') {
		json.code = apiCode;
	}

	if (typeof httpCode === 'string' && httpCode !== '') {
		json.httpCode = httpCode;
	}

	return { json, pairedItem: { item: itemIndex } };
}
