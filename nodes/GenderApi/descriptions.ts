import type { INodeProperties } from 'n8n-workflow';
import { MAX_BATCH_SIZE } from './transport';

const lookupResources = ['gender', 'countryOfOrigin'];

export const resourceProperty: INodeProperties = {
	displayName: 'Resource',
	name: 'resource',
	type: 'options',
	noDataExpression: true,
	options: [
		{
			name: 'Account',
			value: 'account',
		},
		{
			name: 'Country of Origin',
			value: 'countryOfOrigin',
		},
		{
			name: 'Gender',
			value: 'gender',
		},
	],
	default: 'gender',
};

export const genderOperationProperty: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: {
		show: {
			resource: ['gender'],
		},
	},
	options: [
		{
			name: 'Get by Email Address',
			value: 'getByEmailAddress',
			description:
				'Extract the first name from an email address and determine its likely gender (1 credit per name found)',
			action: 'Get gender by email address',
		},
		{
			name: 'Get by First Name',
			value: 'getByFirstName',
			description: 'Determine the likely gender of a first name (1 credit per name found)',
			action: 'Get gender by first name',
		},
		{
			name: 'Get by Full Name',
			value: 'getByFullName',
			description:
				'Split a full name into first and last name and determine the likely gender (1 credit per name found)',
			action: 'Get gender by full name',
		},
	],
	default: 'getByFirstName',
};

export const countryOfOriginOperationProperty: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: {
		show: {
			resource: ['countryOfOrigin'],
		},
	},
	options: [
		{
			name: 'Get by Email Address',
			value: 'getByEmailAddress',
			description:
				'Determine the likely countries of origin of the name in an email address (2 credits per name found)',
			action: 'Get country of origin by email address',
		},
		{
			name: 'Get by First Name',
			value: 'getByFirstName',
			description:
				'Determine the likely countries of origin of a first name (2 credits per name found)',
			action: 'Get country of origin by first name',
		},
		{
			name: 'Get by Full Name',
			value: 'getByFullName',
			description:
				'Determine the likely countries of origin of a full name (2 credits per name found)',
			action: 'Get country of origin by full name',
		},
	],
	default: 'getByFirstName',
};

export const accountOperationProperty: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: {
		show: {
			resource: ['account'],
		},
	},
	options: [
		{
			name: 'Get Statistics',
			value: 'getStatistics',
			description: 'Get the remaining credits and the credits used last month (costs no credits)',
			action: 'Get account statistics',
		},
	],
	default: 'getStatistics',
};

export const nameProperties: INodeProperties[] = [
	{
		displayName: 'First Name',
		name: 'firstName',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. Nathan',
		description: 'The first name to look up (1 to 50 characters)',
		displayOptions: {
			show: {
				resource: lookupResources,
				operation: ['getByFirstName'],
			},
		},
	},
	{
		displayName: 'Full Name',
		name: 'fullName',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. Nathan Smith',
		description:
			'The full name to look up (1 to 100 characters). Gender-API splits it into first and last name.',
		displayOptions: {
			show: {
				resource: lookupResources,
				operation: ['getByFullName'],
			},
		},
	},
	{
		displayName: 'Email Address',
		name: 'email',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. nathan@example.com',
		description: 'The email address to look up. Gender-API extracts the name from it.',
		displayOptions: {
			show: {
				resource: lookupResources,
				operation: ['getByEmailAddress'],
			},
		},
	},
];

export const genderAdditionalFieldsProperty: INodeProperties = {
	displayName: 'Additional Fields',
	name: 'additionalFields',
	type: 'collection',
	placeholder: 'Add Field',
	default: {},
	displayOptions: {
		show: {
			resource: ['gender'],
		},
	},
	options: [
		{
			displayName: 'Country',
			name: 'country',
			type: 'string',
			default: '',
			placeholder: 'e.g. US',
			description:
				"Two-letter ISO 3166-1 country code. The same name can have a different gender in different countries, so this improves the result. Takes precedence over 'IP Address' and 'Locale'.",
		},
		{
			displayName: 'IP Address',
			name: 'ip',
			type: 'string',
			default: '',
			placeholder: 'e.g. 54.201.1.1',
			description:
				"IPv4 or IPv6 address of the person. Gender-API derives the country from it when 'Country' is not set.",
		},
		{
			displayName: 'Locale',
			name: 'locale',
			type: 'string',
			default: '',
			placeholder: 'e.g. en_US',
			description:
				"Browser locale of the person. Gender-API derives the country from it when neither 'Country' nor 'IP Address' is set.",
		},
	],
};

const resultFieldOption: INodeProperties = {
	displayName: 'Put Result in Field',
	name: 'resultField',
	type: 'string',
	default: '',
	placeholder: 'e.g. genderApi',
	description:
		'Name of a field to write the Gender-API answer to, keeping the fields of the input item. Leave empty to output only the Gender-API answer.',
};

export const genderOptionsProperty: INodeProperties = {
	displayName: 'Options',
	name: 'options',
	type: 'collection',
	placeholder: 'Add Option',
	default: {},
	displayOptions: {
		show: {
			resource: ['gender'],
		},
	},
	options: [
		{
			displayName: 'Batch Size',
			name: 'batchSize',
			type: 'number',
			typeOptions: {
				minValue: 1,
				maxValue: MAX_BATCH_SIZE,
			},
			default: MAX_BATCH_SIZE,
			description:
				'How many input items to send to Gender-API in one request. Gender-API accepts up to 100 names per request. Every name still costs one credit. A request needs enough credits for all names in it.',
		},
		resultFieldOption,
	],
};

export const countryOfOriginOptionsProperty: INodeProperties = {
	displayName: 'Options',
	name: 'options',
	type: 'collection',
	placeholder: 'Add Option',
	default: {},
	displayOptions: {
		show: {
			resource: ['countryOfOrigin'],
		},
	},
	options: [resultFieldOption],
};
