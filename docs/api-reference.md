# API Reference

Generated from `C:/Users/antho/Downloads/openapi updated 02.05.26.json` on 2 May 2026.

API title: **iC2App API**
API version: **v1**

## Overview

- Tags: 13
- Paths: 158
- Operations: 201
- Component schemas: 260

## Tag Summary

| Tag | Operations |
| --- | ---: |
| Advisers | 27 |
| ClientProfiles | 64 |
| iComply2.Api | 1 |
| Insurance | 7 |
| Invoices | 5 |
| Licensees | 11 |
| PlatformIntegrations | 6 |
| Platforms | 6 |
| Prompts | 8 |
| RevenueRecords | 20 |
| Revenues | 21 |
| Sara | 15 |
| Users | 10 |

## Endpoints

### Advisers

| Method | Path | Summary | Parameters | Request Body | Responses |
| --- | --- | --- | --- | --- | --- |
| `GET` | `/api/Advisers` | This endpoint will return all the advisers associated with the provided licenseeName and practice name. | `query:licenseeName` `string`<br>`query:practiceName` `string`<br>`query:id` `string` | - | `200` `AdviserDtoIEnumerableApiResult`<br>`400` `AdviserDtoIEnumerableApiResult` |
| `GET` | `/api/Advisers/Clients` | This endpoint will return the lists of clients associated with the adviser licenseeName and optional practice name. | `query:licenseeName` `string`<br>`query:practiceName` `string`<br>`query:searchKey` `string` | - | `200` `ClientDtoIEnumerableApiResult`<br>`400` `ClientDtoIEnumerableApiResult` |
| `POST` | `/api/Advisers/Clients` | This endpoint Creates a new client record based on the provided request data. | - | application/json: `CreateClientRequestDto`<br>text/json: `CreateClientRequestDto`<br>application/*+json: `CreateClientRequestDto` | `200` `ClientDtoApiResult`<br>`400` `ClientDtoApiResult` |
| `GET` | `/api/Advisers/Clients/Categories` | This endpoint will return the lists of clients categories associated with the adviser practice name. | `query:practiceName` required `string` | - | `200` `ClientCategoryDtoIEnumerableApiResult`<br>`400` `ClientCategoryDtoIEnumerableApiResult` |
| `POST` | `/api/Advisers/Deduction` | This enpdoint is used to create new Deduction Record | - | application/json: `Deduction`<br>text/json: `Deduction`<br>application/*+json: `Deduction` | `200` `DeductionApiResult`<br>`400` `DeductionApiResult` |
| `PUT` | `/api/Advisers/Deduction/{deductionId}` | This enpdoint is used to update Deduction associated with the given deductionId and request body. | `path:deductionId` required `string` | application/json: `UpdateDeductionRequest`<br>text/json: `UpdateDeductionRequest`<br>application/*+json: `UpdateDeductionRequest` | `200` `BooleanApiResult`<br>`400` `BooleanApiResult` |
| `DELETE` | `/api/Advisers/Deduction/{deductionId}` | This enpdoint is used to delete Deduction associated with the given deductionId. | `path:deductionId` required `string` | - | `200` `BooleanApiResult`<br>`400` `BooleanApiResult` |
| `GET` | `/api/Advisers/Deduction/Categories` | This enpdoint is used to retrieve Distinct Deduction Categories. | - | - | `200` `StringIEnumerableApiResult`<br>`400` `StringIEnumerableApiResult` |
| `PATCH` | `/api/Advisers/Deduction/Index` | This enpdoint is used to update Deduction index based on the request payload. | - | application/json: `UpdateDeductionIndex`<br>text/json: `UpdateDeductionIndex`<br>application/*+json: `UpdateDeductionIndex` | `200` `BooleanApiResult`<br>`400` `BooleanApiResult` |
| `POST` | `/api/Advisers/Deduction/Search` | This enpdoint is used to search Deductions associated with the given search request input | - | application/json: `DeductionSearchRequest`<br>text/json: `DeductionSearchRequest`<br>application/*+json: `DeductionSearchRequest` | `200` `DeductionResultWithMaxIndexValueApiResult`<br>`400` `DeductionResultWithMaxIndexValueApiResult` |
| `POST` | `/api/Advisers/PayRun` | This enpdoint is used to create new Adviser Pay Run Deduction records will be created from the Deductions Data based on the payrun.Practice | - | application/json: `CreateAdviserPayRuns`<br>text/json: `CreateAdviserPayRuns`<br>application/*+json: `CreateAdviserPayRuns` | `200` `AdviserPayIEnumerableApiResult`<br>`400` `AdviserPayIEnumerableApiResult` |
| `PATCH` | `/api/Advisers/PayRun/{payRunId}` | This enpdoint is used to update Adviser Pay Run associated with the payRunId. Any of the following fields can be udpated : date, deliveryDate, invoiceId, reference, status, and revexReport | `path:payRunId` required `string` | multipart/form-data: `object` | `200` `StringIEnumerableApiResult`<br>`400` `StringIEnumerableApiResult` |
| `DELETE` | `/api/Advisers/PayRun/{payRunId}/Deduction/{payRunDeductionId}` | This enpdoint is used to delete Adviser Pay Run Deduction associated with the given payRunId and payRunDeductionId. | `path:payRunId` required `string`<br>`path:payRunDeductionId` required `string` | - | `200` `BooleanApiResult`<br>`400` `BooleanApiResult` |
| `GET` | `/api/Advisers/PayRun/{payRunId}/Deductions` | This endpoint will return all the deductions associated with the provided payRunId. | `path:payRunId` required `string` | - | `200` `PayRunDeductionResponseApiResult`<br>`400` `PayRunDeductionResponseApiResult` |
| `POST` | `/api/Advisers/PayRun/{payRunId}/Deductions` | This endpoint will be used to create pay run deductions associated with the provided payRunId. | `path:payRunId` required `string` | application/json: `PayRunDeduction`<br>text/json: `PayRunDeduction`<br>application/*+json: `PayRunDeduction` | `200` `PayRunDeductionApiResult`<br>`400` `PayRunDeductionApiResult` |
| `PATCH` | `/api/Advisers/PayRun/{payRunId}/Deductions/{deductionId}` | This endpoint will be used to update pay run deductions associated with the provided payRunId and deduction id. Only fields specified in the request will be updated. Fields supported for updates are: adviser, category, quantity, amount, account, itemCode, taxDescription, startDate, endDate | `path:payRunId` required `string`<br>`path:deductionId` required `string` | application/json: `PayRunDeduction`<br>text/json: `PayRunDeduction`<br>application/*+json: `PayRunDeduction` | `200` `BooleanApiResult`<br>`400` `BooleanApiResult` |
| `PATCH` | `/api/Advisers/PayRun/{payRunId}/Deductions/{deductionId}/Amount/{amount}` | This endpoint will be used to update pay run deduction amount associated with the provided payRunId and deductionId. | `path:payRunId` required `string`<br>`path:deductionId` required `string`<br>`path:amount` required `number:double` | - | `200` `BooleanApiResult`<br>`400` `BooleanApiResult` |
| `POST` | `/api/Advisers/PayRun/{payRunId}/Invoice/Download` | This endpoint will download the purchase order invoice | `path:payRunId` required `string` | - | `200` `ObjectApiResult` |
| `DELETE` | `/api/Advisers/PayRun/Delete` | This enpdoint is used to delete Adviser Pay Run associated with the given lists of payrund ids. If pay runs are paid, it will throw error. | `query:payRunIds` array of `string` | - | `200` `BooleanApiResult`<br>`400` `BooleanApiResult` |
| `GET` | `/api/Advisers/PayRun/References` | This enpdoint is used to retrieve Adviser Pay Run references associated with the given licensee name. | `query:licenseeName` required `string` | - | `200` `StringIEnumerableApiResult`<br>`400` `StringIEnumerableApiResult` |
| `POST` | `/api/Advisers/PayRun/Search` | This enpdoint is used to search Adviser Pay Run associated with the given search request input | - | application/json: `AdviserPayRunRequests`<br>text/json: `AdviserPayRunRequests`<br>application/*+json: `AdviserPayRunRequests` | `200` `AdviserPayRunSearchResponseResultWithTotalAmountApiResult`<br>`400` `AdviserPayRunSearchResponseResultWithTotalAmountApiResult` |
| `PATCH` | `/api/Advisers/PayRun/Status` | This enpdoint is used to update Adviser Pay Run status associated with the given lists of payrund ids. | - | application/json: `UpdatePayRunStatusRequest`<br>text/json: `UpdatePayRunStatusRequest`<br>application/*+json: `UpdatePayRunStatusRequest` | `200` `BooleanApiResult`<br>`400` `BooleanApiResult` |
| `GET` | `/api/Advisers/PayRun/Xero/Accounts` | This enpdoint is used to retrieve Accounts from xero | - | - | `200` `XeroAccountIEnumerableApiResult`<br>`400` `XeroAccountIEnumerableApiResult` |
| `POST` | `/api/Advisers/PayRun/Xero/Invoices` | This enpdoint is used to send invoice to xero for the given payrun Ids. | - | application/json: array of `string`<br>text/json: array of `string`<br>application/*+json: array of `string` | `200` `AdviserPayRunXeroInvoiceResponseListApiResult`<br>`400` `AdviserPayRunXeroInvoiceResponseListApiResult` |
| `GET` | `/api/Advisers/PayRun/Xero/Items` | This enpdoint is used to retrieve item lists from xero | - | - | `200` `XeroItemIEnumerableApiResult`<br>`400` `XeroItemIEnumerableApiResult` |
| `GET` | `/api/Advisers/PayRun/Xero/TaxRates` | This enpdoint is used to retrieve Tax Rates from xero | - | - | `200` `XeroTaxRateIEnumerableApiResult`<br>`400` `XeroTaxRateIEnumerableApiResult` |
| `GET` | `/api/Advisers/V2` | This endpoint will return all the advisers associated with the provided licenseeName | `query:licenseeName` `string` | - | `200` `AdviserDtoIEnumerableApiResult`<br>`400` `AdviserDtoIEnumerableApiResult` |

### ClientProfiles

| Method | Path | Summary | Parameters | Request Body | Responses |
| --- | --- | --- | --- | --- | --- |
| `POST` | `/api/ClientProfiles` | This endpoint is use to create new Client Profile. | - | application/json: `ClientProfile`<br>text/json: `ClientProfile`<br>application/*+json: `ClientProfile` | `200` `ClientProfileApiResult`<br>`400` `ClientProfileApiResult` |
| `GET` | `/api/ClientProfiles/{clientProfileId}` | This endpoint will return the Client Profile Details associated with the provided clientProfileId | `path:clientProfileId` required `string` | - | `200` `ClientProfileApiResult`<br>`400` `ClientProfileApiResult` |
| `PATCH` | `/api/ClientProfiles/{clientProfileId}` | This endpoint is used to update the following fields in client profile: OnboardingIds, ShareWith, XplanUrl, LicenseeName, PracticeName, PracticeLogo, Template, IvanaHelp, and Adviser | `path:clientProfileId` required `string` | application/json: `UpdateClientDetailsRequest`<br>text/json: `UpdateClientDetailsRequest`<br>application/*+json: `UpdateClientDetailsRequest` | `200` `BooleanApiResult`<br>`400` `BooleanApiResult` |
| `DELETE` | `/api/ClientProfiles/{clientProfileId}` | This endpoint is use to delete client profile associated with the provided clientProfileId | `path:clientProfileId` required `string` | - | `200` `ClientProfileApiResult`<br>`400` `ClientProfileApiResult` |
| `GET` | `/api/ClientProfiles/{clientProfileId}/Account` | This endpoint retrieves client accounts / list of accounts associated with the provided clientId | `path:clientProfileId` required `string` | - | `200` `ClientPortfolioAccountIEnumerableApiResult`<br>`400` `ClientPortfolioAccountIEnumerableApiResult` |
| `POST` | `/api/ClientProfiles/{clientProfileId}/Account` | This endpoint Creates account for the specified client. | `path:clientProfileId` required `string` | application/json: `ClientPortfolioAccountDataRequestObject`<br>text/json: `ClientPortfolioAccountDataRequestObject`<br>application/*+json: `ClientPortfolioAccountDataRequestObject` | `200` `ClientPortfolioAccountApiResult`<br>`400` `ClientPortfolioAccountApiResult` |
| `PUT` | `/api/ClientProfiles/{clientProfileId}/Account/{accountId}` | This endpoint Updates client account for the specified clientId and accountId | `path:clientProfileId` required `string`<br>`path:accountId` required `string` | application/json: `ClientPortfolioAccountDataRequestObject`<br>text/json: `ClientPortfolioAccountDataRequestObject`<br>application/*+json: `ClientPortfolioAccountDataRequestObject` | `200` `BooleanApiResult`<br>`400` `BooleanApiResult` |
| `POST` | `/api/ClientProfiles/{clientProfileId}/Assets` | This endpoint is used to create or update client asset records. Multiple asset entries can be created or updated in a single API call. | `path:clientProfileId` required `string` | application/json: `ClientAssetUpdateClientProfileRequest`<br>text/json: `ClientAssetUpdateClientProfileRequest`<br>application/*+json: `ClientAssetUpdateClientProfileRequest` | `200` `ClientAssetListApiResult`<br>`400` `ClientAssetListApiResult` |
| `DELETE` | `/api/ClientProfiles/{clientProfileId}/Assets/{clientAssetId}` | This endpoint is use to delete client Asset associated with the clientProfileId and asset id | `path:clientProfileId` required `string`<br>`path:clientAssetId` required `string` | - | `200` `BooleanApiResult`<br>`400` `BooleanApiResult` |
| `PUT` | `/api/ClientProfiles/{clientProfileId}/Client/{clientId}` | This endpoint is used to update entire client person record using Person model (PUT). | `path:clientProfileId` required `string`<br>`path:clientId` required `string` | application/json: `Person`<br>text/json: `Person`<br>application/*+json: `Person` | `200` `BooleanApiResult`<br>`400` `BooleanApiResult` |
| `PATCH` | `/api/ClientProfiles/{clientProfileId}/Client/{clientId}` | This endpoint is used to update client personal details. | `path:clientProfileId` required `string`<br>`path:clientId` required `string` | application/json: `PersonDetailsRequest`<br>text/json: `PersonDetailsRequest`<br>application/*+json: `PersonDetailsRequest` | `200` `BooleanApiResult`<br>`400` `BooleanApiResult` |
| `PUT` | `/api/ClientProfiles/{clientProfileId}/Client/{clientId}/RiskProfile` | This endpoint is used to update client risk profile details. If risk profile data provided is empty, existing risk profile data will be removed. | `path:clientProfileId` required `string`<br>`path:clientId` required `string` | application/json: `ClientRiskProfileDataRequestObject`<br>text/json: `ClientRiskProfileDataRequestObject`<br>application/*+json: `ClientRiskProfileDataRequestObject` | `200` `ClientRiskProfileApiResult`<br>`400` `ClientRiskProfileApiResult` |
| `POST` | `/api/ClientProfiles/{clientProfileId}/Contacts` | This endpoint is used to create or update client person contact records. Multiple person contact entries can be created or updated in a single API call. | `path:clientProfileId` required `string` | application/json: `PersonContactUpdateClientProfileRequest`<br>text/json: `PersonContactUpdateClientProfileRequest`<br>application/*+json: `PersonContactUpdateClientProfileRequest` | `200` `PersonContactListApiResult`<br>`400` `PersonContactListApiResult` |
| `DELETE` | `/api/ClientProfiles/{clientProfileId}/Contacts/{contactId}` | This endpoint is use to delete client Customer Contact associated with the clientProfileId and contactId | `path:clientProfileId` required `string`<br>`path:contactId` required `string` | - | `200` `BooleanApiResult`<br>`400` `BooleanApiResult` |
| `POST` | `/api/ClientProfiles/{clientProfileId}/Dependants` | This endpoint is used to create or update client Dependant records. Multiple Dependants can be created or updated in a single API call. | `path:clientProfileId` required `string` | application/json: `PersonDependentUpdateClientProfileRequest`<br>text/json: `PersonDependentUpdateClientProfileRequest`<br>application/*+json: `PersonDependentUpdateClientProfileRequest` | `200` `PersonDependentListApiResult`<br>`400` `PersonDependentListApiResult` |
| `DELETE` | `/api/ClientProfiles/{clientProfileId}/Dependants/{dependantId}` | This endpoint is use to delete client Dependants associated with the clientProfileId and Dependant id | `path:clientProfileId` required `string`<br>`path:dependantId` required `string` | - | `200` `BooleanApiResult`<br>`400` `BooleanApiResult` |
| `POST` | `/api/ClientProfiles/{clientProfileId}/Employments` | This endpoint is used to create or update client employment records. Multiple employment entries can be created or updated in a single API call. | `path:clientProfileId` required `string` | application/json: `EmploymentUpdateClientProfileRequest`<br>text/json: `EmploymentUpdateClientProfileRequest`<br>application/*+json: `EmploymentUpdateClientProfileRequest` | `200` `EmploymentListApiResult`<br>`400` `EmploymentListApiResult` |
| `DELETE` | `/api/ClientProfiles/{clientProfileId}/Employments/{employmentId}` | This endpoint is use to delete client Employments associated with the clientProfileId and employment id | `path:clientProfileId` required `string`<br>`path:employmentId` required `string` | - | `200` `BooleanApiResult`<br>`400` `BooleanApiResult` |
| `POST` | `/api/ClientProfiles/{clientProfileId}/Entities` | This endpoint is used to create or update client entity records. Multiple entity entries can be created or updated in a single API call. | `path:clientProfileId` required `string` | application/json: `ClientEntityUpdateClientProfileRequest`<br>text/json: `ClientEntityUpdateClientProfileRequest`<br>application/*+json: `ClientEntityUpdateClientProfileRequest` | `200` `ClientEntityListApiResult`<br>`400` `ClientEntityListApiResult` |
| `DELETE` | `/api/ClientProfiles/{clientProfileId}/Entities/{entityId}` | This endpoint is use to delete client entity associated with the clientProfileId and enityId | `path:clientProfileId` required `string`<br>`path:entityId` required `string` | - | `200` `BooleanApiResult`<br>`400` `BooleanApiResult` |
| `POST` | `/api/ClientProfiles/{clientProfileId}/Expenses` | This endpoint is used to create or update client expenses records. Multiple income expense can be created or updated in a single API call. | `path:clientProfileId` required `string` | application/json: `ClientExpenseUpdateClientProfileRequest`<br>text/json: `ClientExpenseUpdateClientProfileRequest`<br>application/*+json: `ClientExpenseUpdateClientProfileRequest` | `200` `ClientExpenseListApiResult`<br>`400` `ClientExpenseListApiResult` |
| `DELETE` | `/api/ClientProfiles/{clientProfileId}/Expenses/{expenseId}` | This endpoint is use to delete client Income associated with the clientProfileId and expense id | `path:clientProfileId` required `string`<br>`path:expenseId` required `string` | - | `200` `BooleanApiResult`<br>`400` `BooleanApiResult` |
| `POST` | `/api/ClientProfiles/{clientProfileId}/Incomes` | This endpoint is used to create or update client income records. Multiple income entries can be created or updated in a single API call. | `path:clientProfileId` required `string` | application/json: `ClientIncomeUpdateClientProfileRequest`<br>text/json: `ClientIncomeUpdateClientProfileRequest`<br>application/*+json: `ClientIncomeUpdateClientProfileRequest` | `200` `ClientIncomeListApiResult`<br>`400` `ClientIncomeListApiResult` |
| `DELETE` | `/api/ClientProfiles/{clientProfileId}/Incomes/{incomeId}` | This endpoint is use to delete client Income associated with the clientProfileId and income id | `path:clientProfileId` required `string`<br>`path:incomeId` required `string` | - | `200` `BooleanApiResult`<br>`400` `BooleanApiResult` |
| `POST` | `/api/ClientProfiles/{clientProfileId}/Insurance` | This endpoint is used to create or update client Insurance records. Multiple Insurance expense can be created or updated in a single API call. | `path:clientProfileId` required `string` | application/json: `ClientInsuranceUpdateClientProfileRequest`<br>text/json: `ClientInsuranceUpdateClientProfileRequest`<br>application/*+json: `ClientInsuranceUpdateClientProfileRequest` | `200` `ClientInsuranceListApiResult`<br>`400` `ClientInsuranceListApiResult` |
| `DELETE` | `/api/ClientProfiles/{clientProfileId}/Insurance/{insuranceId}` | This endpoint is use to delete client Insurance associated with the clientProfileId and insurance id | `path:clientProfileId` required `string`<br>`path:insuranceId` required `string` | - | `200` `BooleanApiResult`<br>`400` `BooleanApiResult` |
| `POST` | `/api/ClientProfiles/{clientProfileId}/Insurance/{insuranceId}/Policy` | This endpoint is used to create or update Insurance Policy records. Multiple Policies can be created or updated in a single API call. | `path:clientProfileId` required `string`<br>`path:insuranceId` required `string` | application/json: `InsurancePolicyUpdateClientProfileRequest`<br>text/json: `InsurancePolicyUpdateClientProfileRequest`<br>application/*+json: `InsurancePolicyUpdateClientProfileRequest` | `200` `InsurancePolicyListApiResult`<br>`400` `InsurancePolicyListApiResult` |
| `DELETE` | `/api/ClientProfiles/{clientProfileId}/Insurance/{insuranceId}/Policy/{policyId}` | This endpoint is use to delete Insurance Policy associated with the clientProfileId and insurance id and policy id | `path:clientProfileId` required `string`<br>`path:insuranceId` required `string`<br>`path:policyId` required `string` | - | `200` `BooleanApiResult`<br>`400` `BooleanApiResult` |
| `POST` | `/api/ClientProfiles/{clientProfileId}/Liabilities` | This endpoint is used to create or update client liability records. Multiple liability entries can be created or updated in a single API call. | `path:clientProfileId` required `string` | application/json: `ClientLiabilityUpdateClientProfileRequest`<br>text/json: `ClientLiabilityUpdateClientProfileRequest`<br>application/*+json: `ClientLiabilityUpdateClientProfileRequest` | `200` `ClientLiabilityListApiResult`<br>`400` `ClientLiabilityListApiResult` |
| `DELETE` | `/api/ClientProfiles/{clientProfileId}/Liabilities/{liabilityId}` | This endpoint is use to delete client Liability associated with the clientProfileId and liability id | `path:clientProfileId` required `string`<br>`path:liabilityId` required `string` | - | `200` `BooleanApiResult`<br>`400` `BooleanApiResult` |
| `POST` | `/api/ClientProfiles/{clientProfileId}/Partner` | This endpoint is used to create client partner. | `path:clientProfileId` required `string` | application/json: `Person`<br>text/json: `Person`<br>application/*+json: `Person` | `200` `BooleanApiResult`<br>`400` `BooleanApiResult` |
| `PUT` | `/api/ClientProfiles/{clientProfileId}/Partner/{partnerId}` | This endpoint is used to update entire partner person record using Person model (PUT). | `path:clientProfileId` required `string`<br>`path:partnerId` required `string` | application/json: `Person`<br>text/json: `Person`<br>application/*+json: `Person` | `200` `BooleanApiResult`<br>`400` `BooleanApiResult` |
| `PATCH` | `/api/ClientProfiles/{clientProfileId}/Partner/{partnerId}` | This endpoint is used to update client partner personal details. | `path:clientProfileId` required `string`<br>`path:partnerId` required `string` | application/json: `PersonDetailsRequest`<br>text/json: `PersonDetailsRequest`<br>application/*+json: `PersonDetailsRequest` | `200` `BooleanApiResult`<br>`400` `BooleanApiResult` |
| `PUT` | `/api/ClientProfiles/{clientProfileId}/Partner/{partnerId}/RiskProfile` | This endpoint is used to update partner risk profile details. If risk profile data provided is empty, existing risk profile data will be removed. | `path:clientProfileId` required `string`<br>`path:partnerId` required `string` | application/json: `ClientRiskProfileDataRequestObject`<br>text/json: `ClientRiskProfileDataRequestObject`<br>application/*+json: `ClientRiskProfileDataRequestObject` | `200` `ClientRiskProfileApiResult`<br>`400` `ClientRiskProfileApiResult` |
| `POST` | `/api/ClientProfiles/{clientProfileId}/Pensions` | This endpoint is used to create or update client Pension records. Multiple Pension expense can be created or updated in a single API call. | `path:clientProfileId` required `string` | application/json: `ClientPensionUpdateClientProfileRequest`<br>text/json: `ClientPensionUpdateClientProfileRequest`<br>application/*+json: `ClientPensionUpdateClientProfileRequest` | `200` `ClientPensionListApiResult`<br>`400` `ClientPensionListApiResult` |
| `DELETE` | `/api/ClientProfiles/{clientProfileId}/Pensions/{pensionId}` | This endpoint is use to delete client Pension associated with the clientProfileId and pension id | `path:clientProfileId` required `string`<br>`path:pensionId` required `string` | - | `200` `BooleanApiResult`<br>`400` `BooleanApiResult` |
| `POST` | `/api/ClientProfiles/{clientProfileId}/Sections/{sectionId}/Fields` | This endpoint is used to create or update Fields in Client Sections associated with the clientProfileId and SectionId. Multiple Fields can be created or updated in a single API call. | `path:clientProfileId` required `string`<br>`path:sectionId` required `string` | application/json: `ClientObjectiveUpdateClientProfileRequest`<br>text/json: `ClientObjectiveUpdateClientProfileRequest`<br>application/*+json: `ClientObjectiveUpdateClientProfileRequest` | `200` `ClientSectionListApiResult`<br>`400` `ClientSectionListApiResult` |
| `DELETE` | `/api/ClientProfiles/{clientProfileId}/Sections/{sectionId}/Fields/{fieldId}` | This endpoint is use to delete client section field associated with the clientProfileId, sectionId, and fieldId | `path:clientProfileId` required `string`<br>`path:sectionId` required `string`<br>`path:fieldId` required `string` | - | `200` `BooleanApiResult`<br>`400` `BooleanApiResult` |
| `POST` | `/api/ClientProfiles/{clientProfileId}/SuperAnnuations` | This endpoint is used to create or update client SuperAnnuation records. Multiple SuperAnnuation expense can be created or updated in a single API call. | `path:clientProfileId` required `string` | application/json: `SuperAnnuationUpdateClientProfileRequest`<br>text/json: `SuperAnnuationUpdateClientProfileRequest`<br>application/*+json: `SuperAnnuationUpdateClientProfileRequest` | `200` `SuperAnnuationListApiResult`<br>`400` `SuperAnnuationListApiResult` |
| `DELETE` | `/api/ClientProfiles/{clientProfileId}/SuperAnnuations/{supperAnnautionId}` | This endpoint is use to delete client Superannuation associated with the clientProfileId and superannuation id | `path:clientProfileId` required `string`<br>`path:supperAnnautionId` required `string` | - | `200` `BooleanApiResult`<br>`400` `BooleanApiResult` |
| `GET` | `/api/ClientProfiles/Account/{accountId}` | This endpoint retrieves client account associated with the provided accountId | `path:accountId` required `string` | - | `200` `ClientPortfolioAccountApiResult`<br>`400` `ClientPortfolioAccountApiResult` |
| `DELETE` | `/api/ClientProfiles/Account/{accountId}` | This endpoint delete client account associated with the provided accountId | `path:accountId` required `string` | - | `200` `BooleanApiResult`<br>`400` `BooleanApiResult` |
| `GET` | `/api/ClientProfiles/Account/{clientAccountId}/Portfolio` | This endpoint retrieves client portfolios / list of portfolios associated with the provided accountId | `path:clientAccountId` required `string` | - | `200` `ClientPortfolioIEnumerableApiResult`<br>`400` `ClientPortfolioIEnumerableApiResult` |
| `POST` | `/api/ClientProfiles/Account/{clientAccountId}/Portfolio` | This endpoint Creates a new portfolio for the specified client. | `path:clientAccountId` required `string` | application/json: `ClientPortfolioDataRequestObject`<br>text/json: `ClientPortfolioDataRequestObject`<br>application/*+json: `ClientPortfolioDataRequestObject` | `200` `ClientPortfolioApiResult`<br>`400` `ClientPortfolioApiResult` |
| `PUT` | `/api/ClientProfiles/Account/{clientAccountId}/Portfolio/{portfolioId}` | This endpoint Updates portfolio for the specified clientAccountId and portfolioId | `path:clientAccountId` required `string`<br>`path:portfolioId` required `string` | application/json: `ClientPortfolioDataRequestObject`<br>text/json: `ClientPortfolioDataRequestObject`<br>application/*+json: `ClientPortfolioDataRequestObject` | `200` `BooleanApiResult`<br>`400` `BooleanApiResult` |
| `GET` | `/api/ClientProfiles/Account/Portfolio/{portfolioId}` | This endpoint retrieves client portfolio associated with the provided portfolioId | `path:portfolioId` required `string` | - | `200` `ClientPortfolioApiResult`<br>`400` `ClientPortfolioApiResult` |
| `DELETE` | `/api/ClientProfiles/Account/Portfolio/{portfolioId}` | This endpoint delete client portfolio associated with the provided portfolioId | `path:portfolioId` required `string` | - | `200` `BooleanApiResult`<br>`400` `BooleanApiResult` |
| `GET` | `/api/ClientProfiles/ClientSummary/{id}` | This endpoint will return the Client Summary associated with the provided id | `path:id` required `string` | - | `200` `ClientSummaryApiResult`<br>`400` `ClientSummaryApiResult` |
| `POST` | `/api/ClientProfiles/ClientSummary/Search` | This endpoint will Search for Client Summary associated with the provided search filters | - | application/json: `ClientSummarySearchRequest`<br>text/json: `ClientSummarySearchRequest`<br>application/*+json: `ClientSummarySearchRequest` | `200` `ClientSummaryIEnumerableApiResult`<br>`400` `ClientSummaryIEnumerableApiResult` |
| `POST` | `/api/ClientProfiles/ClientSummary/Upload` | This enpdoint is used to upload Client Summary file | - | multipart/form-data: `object` | `200` `ClientSummaryIEnumerableApiResult`<br>`400` `ClientSummaryIEnumerableApiResult` |
| `POST` | `/api/ClientProfiles/FileNote` | This endpoint will create File Note record with the provided request body | - | application/json: `FileNoteDataRequestObject`<br>text/json: `FileNoteDataRequestObject`<br>application/*+json: `FileNoteDataRequestObject` | `200` `FileNoteApiResult`<br>`400` `FileNoteApiResult` |
| `GET` | `/api/ClientProfiles/FileNote/{id}` | This endpoint will return FileNote associated with the provided id | `path:id` required `string` | - | `200` `FileNoteApiResult`<br>`400` `FileNoteApiResult` |
| `PUT` | `/api/ClientProfiles/FileNote/{id}` | This endpoint is used to Update File Note record with the provided request body and id | `path:id` required `string` | application/json: `FileNoteDataRequestObject`<br>text/json: `FileNoteDataRequestObject`<br>application/*+json: `FileNoteDataRequestObject` | `200` `BooleanApiResult`<br>`400` `BooleanApiResult` |
| `DELETE` | `/api/ClientProfiles/FileNote/{id}` | This endpoint is used to Delete File Note associated with the provided id | `path:id` required `string` | - | `200` `BooleanApiResult`<br>`400` `BooleanApiResult` |
| `GET` | `/api/ClientProfiles/FileNote/Client/{id}` | This endpoint will return FileNote associated with the provided id | `path:id` required `string` | - | `200` `FileNoteIEnumerableApiResult`<br>`400` `FileNoteIEnumerableApiResult` |
| `POST` | `/api/ClientProfiles/FileNoteV2` | This endpoint will create File Note record with the provided request body | - | multipart/form-data: `object` | `200` `FileNoteApiResult`<br>`400` `FileNoteApiResult` |
| `PUT` | `/api/ClientProfiles/FileNoteV2/{id}` | This endpoint is used to Update File Note record with the provided request body and id | `path:id` required `string` | multipart/form-data: `object` | `200` `BooleanApiResult`<br>`400` `BooleanApiResult` |
| `POST` | `/api/ClientProfiles/Identity` | Create Identity Check for the given owner which can be either clientId or partnerId depending on the owner type | - | application/json: `IdentityCheck`<br>text/json: `IdentityCheck`<br>application/*+json: `IdentityCheck` | `200` `IdentityCheckApiResult`<br>`400` `IdentityCheckApiResult` |
| `GET` | `/api/ClientProfiles/Identity/{identityId}` | Get Identity Check for the given identityId | `path:identityId` required `string` | - | `200` `IdentityCheckApiResult`<br>`400` `IdentityCheckApiResult` |
| `PUT` | `/api/ClientProfiles/Identity/{identityId}` | Update Identity | `path:identityId` required `string` | application/json: `IdentityCheck`<br>text/json: `IdentityCheck`<br>application/*+json: `IdentityCheck` | `200` `BooleanApiResult`<br>`400` `BooleanApiResult` |
| `DELETE` | `/api/ClientProfiles/Identity/{identityId}` | Delete Identity | `path:identityId` required `string` | - | `200` `BooleanApiResult`<br>`400` `BooleanApiResult` |
| `GET` | `/api/ClientProfiles/Identity/Owner/{ownerId}` | Get List of Identities for the given ownerId which can be either clientId or partnerId depending on the owner type | `path:ownerId` required `string` | - | `200` `IdentityCheckIEnumerableApiResult`<br>`400` `IdentityCheckIEnumerableApiResult` |
| `GET` | `/api/ClientProfiles/ProfileId` | This endpoint will return the Client Profile Id associated with the provided clientId or partnerId | `query:clientId` `string`<br>`query:partnerId` `string` | - | `200` `StringApiResult`<br>`400` `StringApiResult` |
| `POST` | `/api/ClientProfiles/SearchClientProfile` | This enpdoint is used to search client profiles associated with the given search request input | - | application/json: `ClientProfileSearchRequest`<br>text/json: `ClientProfileSearchRequest`<br>application/*+json: `ClientProfileSearchRequest` | `200` `ClientProfileSearchResponsePaginatedResultApiResult`<br>`400` `ClientProfileSearchResponsePaginatedResultApiResult` |

### iComply2.Api

| Method | Path | Summary | Parameters | Request Body | Responses |
| --- | --- | --- | --- | --- | --- |
| `GET` | `/healthy-check` | - | - | - | `200` OK |

### Insurance

| Method | Path | Summary | Parameters | Request Body | Responses |
| --- | --- | --- | --- | --- | --- |
| `GET` | `/api/Insurance/{clientId}/Policies` | Get all policies for the specified client. | `path:clientId` required `string` | - | `200` `ClientPolicyIEnumerableApiResult`<br>`400` `ClientPolicyIEnumerableApiResult` |
| `POST` | `/api/Insurance/{clientId}/Policy` | Create a new policy for the specified client. | `path:clientId` required `string` | application/json: `ClientPolicy`<br>text/json: `ClientPolicy`<br>application/*+json: `ClientPolicy` | `200` `ClientPolicyApiResult`<br>`400` `ClientPolicyApiResult` |
| `GET` | `/api/Insurance/{clientId}/Policy/{id}` | Get a policy for the specified client by policy id. | `path:clientId` required `string`<br>`path:id` required `string` | - | `200` `ClientPolicyApiResult`<br>`400` `ClientPolicyApiResult` |
| `PUT` | `/api/Insurance/{clientId}/Policy/{id}` | Update an existing policy for the specified client. This will not allow update on the policy covers. Covers should be managed separately via the CreateUpdatePolicyCover endpoint. | `path:clientId` required `string`<br>`path:id` required `string` | application/json: `ClientPolicy`<br>text/json: `ClientPolicy`<br>application/*+json: `ClientPolicy` | `200` `ClientPolicyApiResult`<br>`400` `ClientPolicyApiResult` |
| `DELETE` | `/api/Insurance/{clientId}/Policy/{id}` | Delete an existing policy for the specified client. | `path:clientId` required `string`<br>`path:id` required `string` | - | `200` `BooleanApiResult`<br>`400` `BooleanApiResult` |
| `POST` | `/api/Insurance/{clientId}/Policy/{policyId}/Covers` | Create or update policy covers for a policy. | `path:clientId` required `string`<br>`path:policyId` required `string` | application/json: array of `PolicyCover`<br>text/json: array of `PolicyCover`<br>application/*+json: array of `PolicyCover` | `200` `PolicyCoverListApiResult`<br>`400` `PolicyCoverListApiResult` |
| `DELETE` | `/api/Insurance/{clientId}/Policy/{policyId}/Covers/{coverId}` | Delete a single policy cover. | `path:clientId` required `string`<br>`path:policyId` required `string`<br>`path:coverId` required `string` | - | `200` `BooleanApiResult`<br>`400` `BooleanApiResult` |

### Invoices

| Method | Path | Summary | Parameters | Request Body | Responses |
| --- | --- | --- | --- | --- | --- |
| `POST` | `/api/Invoices` | - | - | application/json: `CreateInvoiceRequest`<br>text/json: `CreateInvoiceRequest`<br>application/*+json: `CreateInvoiceRequest` | `200` `InvoiceApiResult`<br>`400` `InvoiceApiResult` |
| `GET` | `/api/Invoices/{id}` | - | `path:id` required `string` | - | `200` `InvoiceApiResult`<br>`400` `InvoiceApiResult` |
| `PUT` | `/api/Invoices/{id}` | - | `path:id` required `string` | application/json: `UpdateInvoiceRequest`<br>text/json: `UpdateInvoiceRequest`<br>application/*+json: `UpdateInvoiceRequest` | `200` `BooleanApiResult`<br>`400` `BooleanApiResult` |
| `DELETE` | `/api/Invoices/{id}` | - | `path:id` required `string` | - | `200` `BooleanApiResult`<br>`400` `BooleanApiResult` |
| `POST` | `/api/Invoices/Search` | - | - | application/json: `InvoiceSearchRequest`<br>text/json: `InvoiceSearchRequest`<br>application/*+json: `InvoiceSearchRequest` | `200` `InvoicePaginatedResultApiResult`<br>`400` `InvoicePaginatedResultApiResult` |

### Licensees

| Method | Path | Summary | Parameters | Request Body | Responses |
| --- | --- | --- | --- | --- | --- |
| `GET` | `/api/Licensees` | This endpoint will return lists of Licensees | - | - | `200` `LicenseeDtoIEnumerableApiResult`<br>`400` `LicenseeDtoIEnumerableApiResult` |
| `POST` | `/api/Licensees` | This endpoint is used to Create Licensee record | - | application/json: `LicenseeDto`<br>text/json: `LicenseeDto`<br>application/*+json: `LicenseeDto` | `200` `LicenseeDtoApiResult`<br>`400` `LicenseeDtoApiResult` |
| `GET` | `/api/Licensees/{licenseeId}` | This endpoint will return the Licensee details associated with the provided licenseeId | `path:licenseeId` required `string` | - | `200` `LicenseeDtoApiResult`<br>`400` `LicenseeDtoApiResult` |
| `PUT` | `/api/Licensees/{licenseeId}` | This endpoint is used to update licensee associated with the provided licenseeId and request body | `path:licenseeId` required `string` | application/json: `LicenseeDto`<br>text/json: `LicenseeDto`<br>application/*+json: `LicenseeDto` | `200` `LicenseeDtoApiResult`<br>`400` `LicenseeDtoApiResult` |
| `DELETE` | `/api/Licensees/{licenseeId}` | This endpoint is used to delete Licensee associated with the provided licenseeId | `path:licenseeId` required `string` | - | `200` `BooleanApiResult`<br>`400` `BooleanApiResult` |
| `PATCH` | `/api/Licensees/{licenseeId}/CustomPrompt` | This endpoint is use to update Licensee Custom Prompt associated with the provided licenseeId | `path:licenseeId` required `string`<br>`query:isCustomPrompt` `boolean` | - | `200` `BooleanApiResult`<br>`400` `BooleanApiResult` |
| `GET` | `/api/Licensees/Practice` | This endpoint will return the lists of Practices associated with the provided licensee name | `query:licenseeName` `string`<br>`query:status` `string` | - | `200` `PracticeDtoIEnumerableApiResult`<br>`400` `PracticeDtoIEnumerableApiResult` |
| `POST` | `/api/Licensees/Practice` | This endpoint is used to create Practice | - | application/json: `PracticeDto`<br>text/json: `PracticeDto`<br>application/*+json: `PracticeDto` | `200` `PracticeDtoApiResult`<br>`400` `PracticeDtoApiResult` |
| `PUT` | `/api/Licensees/Practice/{practiceId}` | This endpoint is used to update Practice associated with the provided practiceId and request body | `path:practiceId` required `string` | application/json: `PracticeDto`<br>text/json: `PracticeDto`<br>application/*+json: `PracticeDto` | `200` `PracticeDtoApiResult`<br>`400` `PracticeDtoApiResult` |
| `PATCH` | `/api/Licensees/Practice/{practiceId}` | This endpoint is used to update Practice Status and/or Practice Licensee associated with the provided practiceId and request body | `path:practiceId` required `string` | application/json: `UpdatePracticeRequest`<br>text/json: `UpdatePracticeRequest`<br>application/*+json: `UpdatePracticeRequest` | `200` `BooleanApiResult`<br>`400` `BooleanApiResult` |
| `DELETE` | `/api/Licensees/Practice/{practiceId}` | This endpoint is used to delete Practice associated with the provided practiceId | `path:practiceId` required `string` | - | `200` `BooleanApiResult`<br>`400` `BooleanApiResult` |

### PlatformIntegrations

| Method | Path | Summary | Parameters | Request Body | Responses |
| --- | --- | --- | --- | --- | --- |
| `POST` | `/api/PlatformIntegrations` | This endpoint creates an external platform mapping. | - | application/json: `ExternalPlatform`<br>text/json: `ExternalPlatform`<br>application/*+json: `ExternalPlatform` | `200` `ExternalPlatformApiResult`<br>`400` `ExternalPlatformApiResult` |
| `GET` | `/api/PlatformIntegrations/{id}` | This endpoint returns the external platform mapping associated with the provided id. | `path:id` required `string` | - | `200` `ExternalPlatformApiResult`<br>`400` `ExternalPlatformApiResult` |
| `PUT` | `/api/PlatformIntegrations/{id}` | This endpoint updates the external platform mapping associated with the provided id. | `path:id` required `string` | application/json: `ExternalPlatform`<br>text/json: `ExternalPlatform`<br>application/*+json: `ExternalPlatform` | `200` `BooleanApiResult`<br>`400` `BooleanApiResult` |
| `DELETE` | `/api/PlatformIntegrations/{id}` | This endpoint deletes the external platform mapping associated with the provided id. | `path:id` required `string` | - | `200` `BooleanApiResult`<br>`400` `BooleanApiResult` |
| `GET` | `/api/PlatformIntegrations/{id}/AuditLogs` | This endpoint returns the audit log entries associated with the provided platform id. | `path:id` required `string` | - | `200` `AuditLogIEnumerableApiResult`<br>`400` `AuditLogIEnumerableApiResult` |
| `POST` | `/api/PlatformIntegrations/Search` | This endpoint searches external platform mappings using provider, account id, and client profile id filters. | - | application/json: `PlatformSearchRequest`<br>text/json: `PlatformSearchRequest`<br>application/*+json: `PlatformSearchRequest` | `200` `ExternalPlatformPaginatedResultApiResult`<br>`400` `ExternalPlatformPaginatedResultApiResult` |

### Platforms

| Method | Path | Summary | Parameters | Request Body | Responses |
| --- | --- | --- | --- | --- | --- |
| `POST` | `/api/Platforms` | This endpoint creates an external platform mapping. | - | application/json: `ExternalPlatform`<br>text/json: `ExternalPlatform`<br>application/*+json: `ExternalPlatform` | `200` `ExternalPlatformApiResult`<br>`400` `ExternalPlatformApiResult` |
| `GET` | `/api/Platforms/{id}` | This endpoint returns the external platform mapping associated with the provided id. | `path:id` required `string` | - | `200` `ExternalPlatformApiResult`<br>`400` `ExternalPlatformApiResult` |
| `PUT` | `/api/Platforms/{id}` | This endpoint updates the external platform mapping associated with the provided id. | `path:id` required `string` | application/json: `ExternalPlatform`<br>text/json: `ExternalPlatform`<br>application/*+json: `ExternalPlatform` | `200` `BooleanApiResult`<br>`400` `BooleanApiResult` |
| `DELETE` | `/api/Platforms/{id}` | This endpoint deletes the external platform mapping associated with the provided id. | `path:id` required `string` | - | `200` `BooleanApiResult`<br>`400` `BooleanApiResult` |
| `GET` | `/api/Platforms/{id}/Audit` | This endpoint returns the audit log entries associated with the provided platform id. | `path:id` required `string` | - | `200` `AuditLogIEnumerableApiResult`<br>`400` `AuditLogIEnumerableApiResult` |
| `POST` | `/api/Platforms/Search` | This endpoint searches external platform mappings using provider, account id, and client profile id filters. | - | application/json: `PlatformSearchRequest`<br>text/json: `PlatformSearchRequest`<br>application/*+json: `PlatformSearchRequest` | `200` `ExternalPlatformPaginatedResultApiResult`<br>`400` `ExternalPlatformPaginatedResultApiResult` |

### Prompts

| Method | Path | Summary | Parameters | Request Body | Responses |
| --- | --- | --- | --- | --- | --- |
| `GET` | `/api/Prompts` | This endpoint will return lists of prompts | `query:isLive` `boolean`<br>`query:isDefault` `boolean`<br>`query:licenseeName` `string` | - | `200` `PromptDtoIEnumerableApiResult`<br>`400` `PromptDtoIEnumerableApiResult` |
| `POST` | `/api/Prompts` | This enpdoint is used to Create Sara Prompts | - | application/json: `PromptDto`<br>text/json: `PromptDto`<br>application/*+json: `PromptDto` | `200` `PromptDtoApiResult`<br>`400` `PromptDtoApiResult` |
| `GET` | `/api/Prompts/{id}` | This endoint will return a prompt that matches the provided id from the request. | `path:id` required `string` | - | `200` `PromptDtoApiResult`<br>`400` `PromptDtoApiResult` |
| `PUT` | `/api/Prompts/{id}` | This endpoint is used to update Sara Prompt | `path:id` required `string` | application/json: `PromptDto`<br>text/json: `PromptDto`<br>application/*+json: `PromptDto` | `200` `PromptDtoApiResult`<br>`400` `PromptDtoApiResult` |
| `DELETE` | `/api/Prompts/{id}` | This endpoint is used to delete Sara Prompt | `path:id` required `string` | - | `200` `BooleanApiResult`<br>`400` `BooleanApiResult` |
| `POST` | `/api/Prompts/CopyAndCreateDefaultPrompts` | This enpdoint is used to Create a Copy of Default Prompts, newly created prompts will have IsDefault set to false and LicenseeName set to the provided licenseeName | `query:licenseeName` `string` | - | `200` `PromptDtoIEnumerableApiResult`<br>`400` `PromptDtoIEnumerableApiResult` |
| `GET` | `/api/Prompts/Options` | This endpoint will return the Sara Prompts Options needed for creating a Sara Review | - | - | `200` `PromptOptionDtoApiResult`<br>`400` `PromptOptionDtoApiResult` |
| `PATCH` | `/api/Prompts/Sort-Index` | This operation modifies the prompt's Index and updates the Title". | - | application/json: array of `UpdatePromptRequest`<br>text/json: array of `UpdatePromptRequest`<br>application/*+json: array of `UpdatePromptRequest` | `200` `BooleanApiResult`<br>`400` `BooleanApiResult` |

### RevenueRecords

| Method | Path | Summary | Parameters | Request Body | Responses |
| --- | --- | --- | --- | --- | --- |
| `GET` | `/api/RevenueRecords/{batchId}` | This enpdoint is used to Retrieve Lists of Revenue associated with the DataUploadId | `path:batchId` required `string` | - | `200` `RevenueRecordIEnumerableApiResult`<br>`400` `RevenueRecordIEnumerableApiResult` |
| `PUT` | `/api/RevenueRecords/{revenueId}/File/{batchId}` | This enpdoint is used to update Revenue associated with the DataUploadId and RevenueId | `path:revenueId` required `string`<br>`path:batchId` required `string` | application/json: `RevenueRecord`<br>text/json: `RevenueRecord`<br>application/*+json: `RevenueRecord` | `200` `BooleanApiResult`<br>`400` `BooleanApiResult` |
| `DELETE` | `/api/RevenueRecords/{revenueId}/File/{batchId}` | This enpdoint is used to Delete Revenue associated with the FileUploadId and RevenueId | `path:revenueId` required `string`<br>`path:batchId` required `string` | - | `200` `BooleanApiResult`<br>`400` `BooleanApiResult` |
| `POST` | `/api/RevenueRecords/BankStatement` | This enpdoint is used to upload Bank statement file | - | multipart/form-data: `object` | `200` `RctiFileUploadListApiResult`<br>`400` `RctiFileUploadListApiResult` |
| `POST` | `/api/RevenueRecords/InspectFile` | This endpoint is used to Inspect File to identify the columns and data structure of the uploaded file, which will be used for provider mapping | - | multipart/form-data: `object` | `200` `InspectFileResponseApiResult`<br>`400` `InspectFileResponseApiResult` |
| `POST` | `/api/RevenueRecords/MatchFile` | This endpoint is used to uploaded file and match to the requested provider | - | multipart/form-data: `object` | `200` `MatchFileResponseApiResult`<br>`400` `MatchFileResponseApiResult` |
| `GET` | `/api/RevenueRecords/ProductProviders` | This enpdoint is used to retrieve Distinct Revenue Product Providers | - | - | `200` `StringIEnumerableApiResult`<br>`400` `StringIEnumerableApiResult` |
| `GET` | `/api/RevenueRecords/ProviderMapping` | This endpoint is used to retrieve all Provider mapping | - | - | `200` `ProviderMappingIEnumerableApiResult`<br>`400` `ProviderMappingIEnumerableApiResult` |
| `POST` | `/api/RevenueRecords/ProviderMapping` | This endpoint is used to Create Provider mapping | - | multipart/form-data: `object` | `200` `ProviderMappingApiResult`<br>`400` `ProviderMappingApiResult` |
| `PUT` | `/api/RevenueRecords/ProviderMapping/{id}` | This endpoint is used to Update Provider mapping | `path:id` required `string` | multipart/form-data: `object` | `200` `ProviderMappingApiResult`<br>`400` `ProviderMappingApiResult` |
| `DELETE` | `/api/RevenueRecords/ProviderMapping/{id}` | This enpdoint is used to Delete Provider | `path:id` required `string` | - | `200` `BooleanApiResult`<br>`400` `BooleanApiResult` |
| `POST` | `/api/RevenueRecords/ProviderMapping/Preview` | This endpoint is used to View the structure of provider mapping | - | multipart/form-data: `object` | `200` `ProviderPreviewResponseApiResult`<br>`400` `ProviderPreviewResponseApiResult` |
| `GET` | `/api/RevenueRecords/RctiFileUpload` | This enpdoint is used to retrieve RCTI files upload history. | - | - | `200` `RctiFileUploadIEnumerableApiResult`<br>`400` `RctiFileUploadIEnumerableApiResult` |
| `PATCH` | `/api/RevenueRecords/RctiFileUpload/{rctiFileUploadId}` | This endpoint is used to update BankTransactionDate, BankTransactionAmount and ProductProvider in RctiFileUpload container | `path:rctiFileUploadId` required `string` | application/json: `BankTransactionUpdateRequest`<br>text/json: `BankTransactionUpdateRequest`<br>application/*+json: `BankTransactionUpdateRequest` | `200` `BooleanApiResult`<br>`400` `BooleanApiResult` |
| `DELETE` | `/api/RevenueRecords/RctiFileUpload/{rctiFileUploadId}` | This enpdoint is used to delete RCTI file and corresponding RCTI records associated with the given RCTI file upload Id | `path:rctiFileUploadId` required `string` | - | `200` `BooleanApiResult`<br>`400` `BooleanApiResult` |
| `DELETE` | `/api/RevenueRecords/RctiFileUpload/{rctiFileUploadId}/RemoveMatchRevenues` | This enpdoint is used to delete match revenues associated with the given RCTI file upload Id | `path:rctiFileUploadId` required `string` | - | `200` `BooleanApiResult`<br>`400` `BooleanApiResult` |
| `POST` | `/api/RevenueRecords/RctiFileUpload/Search` | This endpoint is used to search RCTI file upload history. | - | application/json: `RctiFileUploadSearchRequest`<br>text/json: `RctiFileUploadSearchRequest`<br>application/*+json: `RctiFileUploadSearchRequest` | `200` `RctiFileUploadDtoPaginatedResultApiResult`<br>`400` `RctiFileUploadDtoPaginatedResultApiResult` |
| `GET` | `/api/RevenueRecords/RevexDataUpload` | This endpoint is used to retrieve Revex data uploads. | - | - | `200` `RevenueFileUploadIEnumerableApiResult`<br>`400` `RevenueFileUploadIEnumerableApiResult` |
| `POST` | `/api/RevenueRecords/RevexDataUpload` | This endpoint is used to upload a Revex revenue file and create revenue records. | - | multipart/form-data: `object` | `200` `RevenueRecordIEnumerableApiResult`<br>`400` `RevenueRecordIEnumerableApiResult` |
| `POST` | `/api/RevenueRecords/Search` | This enpdoint is used to search Revenues associated with the given search request input | - | application/json: `RevenueSearchRequest`<br>text/json: `RevenueSearchRequest`<br>application/*+json: `RevenueSearchRequest` | `200` `RevenueRecordResultWithRevenueAmountApiResult`<br>`400` `RevenueRecordResultWithRevenueAmountApiResult` |

### Revenues

| Method | Path | Summary | Parameters | Request Body | Responses |
| --- | --- | --- | --- | --- | --- |
| `POST` | `/api/Revenues` | This enpdoint is used to Create Revenue records and DataUpload. | - | multipart/form-data: `object` | `200` `RevenueDataResponseApiResult`<br>`400` `RevenueDataResponseApiResult` |
| `GET` | `/api/Revenues/{dataUploadId}` | This enpdoint is used to Retrieve Lists of Revenue associated with the DataUploadId | `path:dataUploadId` required `string` | - | `200` `RevenueDtoListApiResult`<br>`400` `RevenueDtoListApiResult` |
| `PUT` | `/api/Revenues/{revenueId}/File/{fileUploadId}` | This enpdoint is used to update Revenue associated with the DataUploadId and RevenueId | `path:revenueId` required `string`<br>`path:fileUploadId` required `string` | application/json: `RevenueDto`<br>text/json: `RevenueDto`<br>application/*+json: `RevenueDto` | `200` `RevenueDtoApiResult`<br>`400` `RevenueDtoApiResult` |
| `DELETE` | `/api/Revenues/{revenueId}/File/{fileUploadId}` | This enpdoint is used to Delete Revenue associated with the FileUploadId and RevenueId | `path:revenueId` required `string`<br>`path:fileUploadId` required `string` | - | `200` `BooleanApiResult`<br>`400` `BooleanApiResult` |
| `GET` | `/api/Revenues/DataUpload` | This enpdoint is used to Retrieve Data Uploads and corresponding Revenue records | `query:dataUploadId` `string`<br>`query:uploadedBy` `string`<br>`query:uploadDate` `string`<br>`query:licenseeName` `string`<br>`query:practiceName` `string` | - | `200` `RevenueDataResponseIEnumerableApiResult`<br>`400` `RevenueDataResponseIEnumerableApiResult` |
| `DELETE` | `/api/Revenues/DataUpload/{dataUploadId}` | This enpdoint is used to Delete DataUpload and Revenue records | `path:dataUploadId` required `string` | - | `200` `BooleanApiResult`<br>`400` `BooleanApiResult` |
| `POST` | `/api/Revenues/DataUpload/{dataUploadId}/SearchRevenues` | This enpdoint is used to retrieve Revenue records associated with the given DataUploadId | `path:dataUploadId` required `string` | application/json: `PaginationRequest`<br>text/json: `PaginationRequest`<br>application/*+json: `PaginationRequest` | `200` `RevenueDtoPaginatedResultApiResult`<br>`400` `RevenueDtoPaginatedResultApiResult` |
| `GET` | `/api/Revenues/DataUploads` | This enpdoint is used to Retrieve DataUpload records | `query:dataUploadId` `string`<br>`query:uploadedBy` `string`<br>`query:uploadDate` `string`<br>`query:licenseeName` `string`<br>`query:practiceName` `string` | - | `200` `DataUploadDtoIEnumerableApiResult`<br>`400` `DataUploadDtoIEnumerableApiResult` |
| `GET` | `/api/Revenues/FeeTypes` | This enpdoint is used to retrieve Revenue Fee Types | - | - | `200` `StringIEnumerableApiResult`<br>`400` `StringIEnumerableApiResult` |
| `POST` | `/api/Revenues/File/{fileUploadId}` | This enpdoint is used to Add Revenue record associated with the FileUploadId | `path:fileUploadId` required `string` | application/json: `RevenueDto`<br>text/json: `RevenueDto`<br>application/*+json: `RevenueDto` | `200` `RevenueDtoApiResult`<br>`400` `RevenueDtoApiResult` |
| `POST` | `/api/Revenues/Invoice/Search` | This enpdoint is used to search an invoice. Search Invoce result will be transformed itno revenue data structure. It will return all revenues associated with the given search filters. | - | application/json: `SearchInvoiceRequest`<br>text/json: `SearchInvoiceRequest`<br>application/*+json: `SearchInvoiceRequest` | `200` `RevenueDtoIEnumerableApiResult`<br>`400` `RevenueDtoIEnumerableApiResult` |
| `GET` | `/api/Revenues/ProductProviders` | This enpdoint is used to retrieve Revenue Product Providers | - | - | `200` `StringIEnumerableApiResult`<br>`400` `StringIEnumerableApiResult` |
| `GET` | `/api/Revenues/RctiFileUpload` | This enpdoint is used to retrieve RCTI files upload history. | - | - | `200` `RctiFileUploadIEnumerableApiResult`<br>`400` `RctiFileUploadIEnumerableApiResult` |
| `POST` | `/api/Revenues/RctiFileUpload` | This enpdoint is used to upload RCTI file and process RCTI records | - | multipart/form-data: `object` | `200` `RctiFileUploadApiResult`<br>`400` `RctiFileUploadApiResult` |
| `PATCH` | `/api/Revenues/RctiFileUpload/{rctiFileUploadId}` | This endpoint is used to update BankTransactionDate, BankTransactionAmount and ProductProvider in RctiFileUpload container | `path:rctiFileUploadId` required `string` | application/json: `BankTransactionUpdateRequest`<br>text/json: `BankTransactionUpdateRequest`<br>application/*+json: `BankTransactionUpdateRequest` | `200` `BooleanApiResult`<br>`400` `BooleanApiResult` |
| `DELETE` | `/api/Revenues/RctiFileUpload/{rctiFileUploadId}` | This enpdoint is used to delete RCTI file and corresponding RCTI records associated with the given RCTI file upload Id | `path:rctiFileUploadId` required `string` | - | `200` `BooleanApiResult`<br>`400` `BooleanApiResult` |
| `POST` | `/api/Revenues/RctiFileUpload/{rctiFileUploadId}/Retry` | This enpdoint is used to retry reupload process of RCTI file | `path:rctiFileUploadId` required `string` | application/json: `RctiFileUpload`<br>text/json: `RctiFileUpload`<br>application/*+json: `RctiFileUpload` | `200` `BooleanApiResult`<br>`400` `BooleanApiResult` |
| `POST` | `/api/Revenues/RctiTransaction` | This enpdoint is used to create transaction, no rcti file will be created and no record will be processed when this endpoint is called. User will manaually add revenues for this created transaction. | - | application/json: `UploadRctiTransactionRequest`<br>text/json: `UploadRctiTransactionRequest`<br>application/*+json: `UploadRctiTransactionRequest` | `200` `RctiFileUploadApiResult`<br>`400` `RctiFileUploadApiResult` |
| `POST` | `/api/Revenues/Search` | This enpdoint is used to search Revenues associated with the given search request input | - | application/json: `RevenueSearchRequest`<br>text/json: `RevenueSearchRequest`<br>application/*+json: `RevenueSearchRequest` | `200` `RevenueResultWithTotalAmountApiResult`<br>`400` `RevenueResultWithTotalAmountApiResult` |
| `POST` | `/api/Revenues/Upload` | This enpdoint is used to upload json documents from AI Agent Foundry | - | application/json: `object`<br>text/json: `object`<br>application/*+json: `object` | `200` `BooleanApiResult`<br>`400` `BooleanApiResult` |
| `POST` | `/api/Revenues/Upload/SearchRevex` | This enpdoint is used to retrieve Revex records associated with the given search request input | - | application/json: `RevexSearchRequest`<br>text/json: `RevexSearchRequest`<br>application/*+json: `RevexSearchRequest` | `200` `RevexDtoPaginatedResultApiResult`<br>`400` `RevexDtoPaginatedResultApiResult` |

### Sara

| Method | Path | Summary | Parameters | Request Body | Responses |
| --- | --- | --- | --- | --- | --- |
| `POST` | `/api/Sara` | This endpoint is used to Create Sara Review. | - | multipart/form-data: `object` | `200` `SaraReportStatusDtoApiResult`<br>`400` `SaraReportStatusDtoApiResult` |
| `GET` | `/api/Sara/{id}` | This endpoint will return specific sara review detail | `path:id` required `string`<br>`query:practiceName` required `string` | - | `200` `SaraReviewDtoApiResult`<br>`400` `SaraReviewDtoApiResult` |
| `PATCH` | `/api/Sara/{id}` | Updates Adviser Name, Client Name, Review Status | `path:id` required `string` | application/json: `UpdateSaraReviewRequest`<br>text/json: `UpdateSaraReviewRequest`<br>application/*+json: `UpdateSaraReviewRequest` | `200` `BooleanApiResult`<br>`400` `BooleanApiResult` |
| `DELETE` | `/api/Sara/{id}` | Delete Sara Review Item | `path:id` required `string`<br>`query:practiceName` `string` | - | `200` `BooleanApiResult`<br>`400` `BooleanApiResult` |
| `GET` | `/api/Sara/{id}/{promptIndex}` | This endpoint is used for Getting Sara Review Conversations via id and PromptIndex | `path:id` required `string`<br>`path:promptIndex` required `integer:int32` | - | `200` `SaraReviewConversationDtoApiResult`<br>`400` `SaraReviewConversationDtoApiResult` |
| `POST` | `/api/Sara/{id}/Conversation/{promptId}` | This endpoint is used for resending prompt on sara review conversation that has a status of either Failed or Not Applicable | `path:id` required `string`<br>`path:promptId` required `string` | application/json: `SaraReviewPromptRequestDto`<br>text/json: `SaraReviewPromptRequestDto`<br>application/*+json: `SaraReviewPromptRequestDto` | `200` `SaraReviewPromptResponseApiResult`<br>`400` `SaraReviewPromptResponseApiResult` |
| `PATCH` | `/api/Sara/{id}/Conversation/{promptIndex}` | This endpoint is used for Updating Sara Review Conversation. The following fields are supported for updates (passfail, status, content) | `path:id` required `string`<br>`path:promptIndex` required `integer:int32` | application/json: `UpdateSaraReviewConversationRequest`<br>text/json: `UpdateSaraReviewConversationRequest`<br>application/*+json: `UpdateSaraReviewConversationRequest` | `200` `BooleanApiResult`<br>`400` `BooleanApiResult` |
| `POST` | `/api/Sara/{id}/Conversation/{promptIndex}/Comments` | This endpoint is used for Adding new comment in Sara Review Conversation Comments (remediationComment, adviserComment , managerComment) | `path:id` required `string`<br>`path:promptIndex` required `integer:int32` | application/json: `UpdateSaraReviewConversationCommentRequest`<br>text/json: `UpdateSaraReviewConversationCommentRequest`<br>application/*+json: `UpdateSaraReviewConversationCommentRequest` | `200` `BooleanApiResult`<br>`400` `BooleanApiResult` |
| `PATCH` | `/api/Sara/{id}/Conversation/{promptIndex}/Comments/{commentType}` | This endpoint is used for deleting a comment from Sara Review Conversation Comments (remediationComment, adviserComment , managerComment) | `path:id` required `string`<br>`path:promptIndex` required `integer:int32`<br>`path:commentType` required `string` | application/json: `DeleteSaraReviewCommentRequest`<br>text/json: `DeleteSaraReviewCommentRequest`<br>application/*+json: `DeleteSaraReviewCommentRequest` | `200` `BooleanApiResult`<br>`400` `BooleanApiResult` |
| `POST` | `/api/Sara/{id}/Download` | This endpoint will download the sara review document | `path:id` required `string` | application/json: `DownloadSaraReviewRequestDto`<br>text/json: `DownloadSaraReviewRequestDto`<br>application/*+json: `DownloadSaraReviewRequestDto` | `200` `ObjectApiResult` |
| `GET` | `/api/Sara/{id}/Report` | Get Sara Reports with Status details (pass/fail) | `path:id` required `string`<br>`query:practiceName` required `string` | - | `200` `SaraReportStatusDtoApiResult`<br>`400` `SaraReportStatusDtoApiResult` |
| `PATCH` | `/api/Sara/{id}/ReviewStatus` | Update Sara Review Status | `path:id` required `string` | application/json: `UpdateSaraReviewStatusRequest`<br>text/json: `UpdateSaraReviewStatusRequest`<br>application/*+json: `UpdateSaraReviewStatusRequest` | `200` `BooleanApiResult`<br>`400` `BooleanApiResult` |
| `GET` | `/api/Sara/Observations` | This endpoint is used for Getting Lists of Sara Observations by Licencee Name | `query:licenceeName` required `string` | - | `200` `SaraReviewObservationDtoIEnumerableApiResult`<br>`400` `SaraReviewObservationDtoIEnumerableApiResult` |
| `GET` | `/api/Sara/Reviews` | This endpoint is used for Getting Lists of Sara Reviews by Licencee Name | `query:licenceeName` required `string` | - | `200` `SaraReviewBaseDtoIEnumerableApiResult`<br>`400` `SaraReviewBaseDtoIEnumerableApiResult` |
| `GET` | `/api/Sara/Reviews/Count` | This endpoint is used for Getting the number of created Sara Reviews of active login user | - | - | `200` `Int32ApiResult`<br>`400` `Int32ApiResult` |

### Users

| Method | Path | Summary | Parameters | Request Body | Responses |
| --- | --- | --- | --- | --- | --- |
| `GET` | `/api/Users` | This endpoint will return the lists of Users | - | - | `200` `UserDtoIEnumerableApiResult`<br>`400` `UserDtoIEnumerableApiResult` |
| `GET` | `/api/Users/{userId}` | This endpoint will return the user details for the provided userId | `path:userId` required `string` | - | `200` `UserDtoApiResult`<br>`400` `UserDtoApiResult` |
| `PATCH` | `/api/Users/{userId}` | This endpoint is used to update user details | `path:userId` required `string` | application/json: `UpdateUserRequest`<br>text/json: `UpdateUserRequest`<br>application/*+json: `UpdateUserRequest` | `200` `BooleanApiResult`<br>`400` `BooleanApiResult` |
| `DELETE` | `/api/Users/{userId}` | This endpoint is used to delete user | `path:userId` required `string` | - | `200` `BooleanApiResult`<br>`400` `BooleanApiResult` |
| `GET` | `/api/Users/AppAccess` | This endpoint will return the lists of User App Access | - | - | `200` `StringIEnumerableApiResult`<br>`400` `StringIEnumerableApiResult` |
| `GET` | `/api/Users/ComplianceManagers` | This endpoint will return the lists of Compliance Managers | - | - | `200` `ComplianceManagerIEnumerableApiResult`<br>`400` `ComplianceManagerIEnumerableApiResult` |
| `GET` | `/api/Users/ForgotPassword` | This endpoint is used for forgot password, if email does exist, it will send a link for password reset | `query:email` required `string:email` | - | `200` `BooleanApiResult`<br>`400` `BooleanApiResult` |
| `POST` | `/api/Users/Login` | This endpoint is used to handle login request | `query:useNewSaraPage` `boolean` | application/json: `LoginRequest`<br>text/json: `LoginRequest`<br>application/*+json: `LoginRequest` | `200` `LoginResponseApiResult`<br>`400` `LoginResponseApiResult` |
| `POST` | `/api/Users/ResetPassword` | This endpoint is used for password reset | - | application/json: `ResetPasswordRequest`<br>text/json: `ResetPasswordRequest`<br>application/*+json: `ResetPasswordRequest` | `200` `BooleanApiResult`<br>`400` `BooleanApiResult` |
| `GET` | `/api/Users/SubscriptionPlans` | This endpoint will return the lists of Subscription Plans | - | - | `200` `SubscriptionPlanDtoIEnumerableApiResult`<br>`400` `SubscriptionPlanDtoIEnumerableApiResult` |
| `POST` | `/api/Users/VerifyTwoFactorAuthentication` | This endpoint is used to verify two factor authenticator request | - | application/json: `TwoFactorAuthenticationRequest`<br>text/json: `TwoFactorAuthenticationRequest`<br>application/*+json: `TwoFactorAuthenticationRequest` | `200` `JwtTokenResponseApiResult`<br>`400` `JwtTokenResponseApiResult` |

## Component Schemas

Schemas are listed by name for quick lookup. See the Swagger source file for full property-level detail.

- `AdviserDto` (object): id, name, email, practiceName, licenseeName, licenseeId
- `AdviserDtoIEnumerableApiResult` (object): statusCode, status, data, message, modelErrors
- `AdviserPay` (object): id, date, deliveryDate, startDate, endDate, invoiceId, licensee, practice, reference, revexReport, status, createdDate, ... +2
- `AdviserPayIEnumerableApiResult` (object): statusCode, status, data, message, modelErrors
- `AdviserPayRunRequests` (object): continuationToken, pageSize, reference, status, practiceName, licenseeName
- `AdviserPayRunSearchResponse` (object): id, date, deliveryDate, startDate, endDate, invoiceId, licensee, practice, reference, status, createdDate, modifiedDate, ... +3
- `AdviserPayRunSearchResponseResultWithTotalAmount` (object): continuationToken, totalPageCount, items, totalAmount, currentPageTotalAmount
- `AdviserPayRunSearchResponseResultWithTotalAmountApiResult` (object): statusCode, status, data, message, modelErrors
- `AdviserPayRunXeroInvoiceResponse` (object): invoiceNumber, payRunId, payRunStatus
- `AdviserPayRunXeroInvoiceResponseListApiResult` (object): statusCode, status, data, message, modelErrors
- `AuditLog` (object): id, containerName, containerId, action, user, transactionDate, oldValue, newValue
- `AuditLogIEnumerableApiResult` (object): statusCode, status, data, message, modelErrors
- `BankTransactionUpdateRequest` (object): bankTransactionDate, transactionAmount, totalAllocatedAmount, providerName, modifiedBy, rctiFile
- `BooleanApiResult` (object): statusCode, status, data, message, modelErrors
- `CheckTypeDto` (object): reviewType, saraPromptChecks
- `CitationDto` (object): content, title, url, filepath, chunkId
- `CitationWrapperDto` (object): intent, citations
- `ClientAccount` (object): id, accountName, accountDescription
- `ClientAdviser` (object): id, entity, name, email
- `ClientAdviserDto` (object): id, entity, name, email
- `ClientAsset` (object): creator, modifier, modifiedDate, createdDate, id, type, assetType, currentValue, cost, coverRequired, acquisitionDate, joint, ... +5
- `ClientAssetListApiResult` (object): statusCode, status, data, message, modelErrors
- `ClientAssetUpdateClientProfileRequest` (object): currentUser, request
- `ClientCategoryDto` (object): id, categoryName, practiceName
- `ClientCategoryDtoIEnumerableApiResult` (object): statusCode, status, data, message, modelErrors
- `ClientDto` (object): id, name, clientAdviserName, clientAdviserEmail, clientAdviserLicenseeName, clientAdviserPracticeName
- `ClientDtoApiResult` (object): statusCode, status, data, message, modelErrors
- `ClientDtoIEnumerableApiResult` (object): statusCode, status, data, message, modelErrors
- `ClientEntity` (object): creator, modifier, modifiedDate, createdDate, id, entitiesId, name, type, owner
- `ClientEntityListApiResult` (object): statusCode, status, data, message, modelErrors
- `ClientEntityUpdateClientProfileRequest` (object): currentUser, request
- `ClientExpense` (object): creator, modifier, modifiedDate, createdDate, id, type, description, joint, amount, totalExpenses, indexation, liability, ... +2
- `ClientExpenseListApiResult` (object): statusCode, status, data, message, modelErrors
- `ClientExpenseUpdateClientProfileRequest` (object): currentUser, request
- `ClientIncome` (object): creator, modifier, modifiedDate, createdDate, id, type, converRequired, description, joint, amount, indexation, totalIncome, ... +6
- `ClientIncomeListApiResult` (object): statusCode, status, data, message, modelErrors
- `ClientIncomeUpdateClientProfileRequest` (object): currentUser, request
- `ClientInsurance` (object): creator, modifier, modifiedDate, createdDate, id, coverRequired, sumInsured, joint, insurer, status, superFund, owner, ... +1
- `ClientInsuranceListApiResult` (object): statusCode, status, data, message, modelErrors
- `ClientInsuranceUpdateClientProfileRequest` (object): currentUser, request
- `ClientLiability` (object): creator, modifier, modifiedDate, createdDate, id, loanType, accountNumber, loanTerm, fixedTerm, bankName, coverRequired, outstandingBalance, ... +10
- `ClientLiabilityListApiResult` (object): statusCode, status, data, message, modelErrors
- `ClientLiabilityUpdateClientProfileRequest` (object): currentUser, request
- `ClientObjective` (object): creator, modifier, modifiedDate, createdDate, id, fieldTitle, question, response, owner
- `ClientObjectiveUpdateClientProfileRequest` (object): currentUser, request
- `ClientPension` (object): creator, modifier, modifiedDate, createdDate, id, type, balance, superFund, accountNumber, annualDrawDown, annualReturn, payment, ... +2
- `ClientPensionListApiResult` (object): statusCode, status, data, message, modelErrors
- `ClientPensionUpdateClientProfileRequest` (object): currentUser, request
- `ClientPolicy` (object): creator, modifier, modifiedDate, createdDate, id, clientId, policyOwner, insurer, policyNumber, status, linkedSuperFund, covers
- `ClientPolicyApiResult` (object): statusCode, status, data, message, modelErrors
- `ClientPolicyIEnumerableApiResult` (object): statusCode, status, data, message, modelErrors
- `ClientPortfolio` (object): creator, modifier, modifiedDate, createdDate, id, licenseeName, practiceName, account, positionExchange, positionDescription, positionCode, units, ... +6
- `ClientPortfolioAccount` (object): creator, modifier, modifiedDate, createdDate, id, clientId, accountName, accountDescription, owner, jointAccount, licensee, practice
- `ClientPortfolioAccountApiResult` (object): statusCode, status, data, message, modelErrors
- `ClientPortfolioAccountDataRequestObject` (object): currentUser, request
- `ClientPortfolioAccountIEnumerableApiResult` (object): statusCode, status, data, message, modelErrors
- `ClientPortfolioApiResult` (object): statusCode, status, data, message, modelErrors
- `ClientPortfolioDataRequestObject` (object): currentUser, request
- `ClientPortfolioIEnumerableApiResult` (object): statusCode, status, data, message, modelErrors
- `ClientProfile` (object): id, xplanUrl, ivanaHelp, licensee, practice, practiceLogo, modifiedDate, createdDate, template, client, partner, dependants, ... +14
- `ClientProfileApiResult` (object): statusCode, status, data, message, modelErrors
- `ClientProfileSearchRequest` (object): continuationToken, pageSize, clientName, clientCategory, partnerName, adviserName, practiceName, licenseeName
- `ClientProfileSearchResponse` (object): id, source, maritalStatus, accountStatus, entityId, ic2AppId, practice, licensee, shareWith, contacts, nationalId, client, ... +3
- `ClientProfileSearchResponsePaginatedResult` (object): continuationToken, totalPageCount, items
- `ClientProfileSearchResponsePaginatedResultApiResult` (object): statusCode, status, data, message, modelErrors
- `ClientRiskProfile` (object): creator, modifier, modifiedDate, createdDate, agreeOutcome, score, resultDisplay, notAgree, resultGraph, answer
- `ClientRiskProfileApiResult` (object): statusCode, status, data, message, modelErrors
- `ClientRiskProfileDataRequestObject` (object): currentUser, request
- `ClientSection` (object): id, index, sectionTitle, description, fields
- `ClientSectionListApiResult` (object): statusCode, status, data, message, modelErrors
- `ClientSummary` (object): id, clientReference, clientName, policyNumber, adviserCode, adviserName, practiceCode, practiceName, licenseeName, productName, providerName, uploadedDate, ... +1
- `ClientSummaryApiResult` (object): statusCode, status, data, message, modelErrors
- `ClientSummaryIEnumerableApiResult` (object): statusCode, status, data, message, modelErrors
- `ClientSummarySearchRequest` (object): clientName, adviserCode, adviserName, practiceCode, practiceName, clientReference
- `ComplianceManager` (object): id, name, email
- `ComplianceManagerIEnumerableApiResult` (object): statusCode, status, data, message, modelErrors
- `CoversationCommentDto` (object): creator, creatorName, message, date, id, isAllowedToDeleteComment
- `CoversationDto` (object): promptId, promptIndex, auditQuestion, promptRegRef, content, citation, intent, passfail, status, remediationComments, adviserComments, managerComments, ... +1
- `CreateAdviserPayRunRequest` (object): date, deliveryDate, invoiceId, licensee, reference, revexReport, status, createdDate, modifiedDate, startDate, endDate
- `CreateAdviserPayRuns` (object): practices, payRunRequest
- `CreateClientRequestDto` (object): clientFirstName, clientLastName, clientAdviserPracticeName, clientAdviserLicenseeName, clientCategory, clientCategoryId, status, email, title, clientAdviserId, clientAdviserName, clientAdviserPreferredEmail
- `CreateInvoiceItemRequest` (object): description*, quantity*, priceExGst*, totalGst
- `CreateInvoiceRequest` (object): clientId*, referenceNumber*, clientName*, clientEmail, adviserName*, serviceType*, clientEntityId*, dueDate*, includeStripePaymentLink, printAsPdf, items*, createdBy
- `CurrentUser` (object): id, name, email
- `DataUploadDto` (object): id, type, uploadDate, uploadedBy, licenseeName, practiceName, periodStartDate, periodEndDate, rctiFile
- `DataUploadDtoIEnumerableApiResult` (object): statusCode, status, data, message, modelErrors
- `Deduction` (object): id, index, account, accountDescription, adviser, amount, licensee, practice, category, endDate, itemCode, itemDescription, ... +7
- `DeductionApiResult` (object): statusCode, status, data, message, modelErrors
- `DeductionResultWithMaxIndexValue` (object): continuationToken, totalPageCount, items, maxIndexValue
- `DeductionResultWithMaxIndexValueApiResult` (object): statusCode, status, data, message, modelErrors
- `DeductionSearchRequest` (object): continuationToken, pageSize, adviser, practiceName, category
- `DeleteSaraReviewCommentRequest` (object): practiceName, commentId
- `DownloadSaraReviewRequestDto` (object): practiceName
- `Employment` (object): creator, modifier, modifiedDate, createdDate, id, jobTitle, status, employer, salary, frequency, primaryEmployment, startDate, ... +2
- `EmploymentListApiResult` (object): statusCode, status, data, message, modelErrors
- `EmploymentUpdateClientProfileRequest` (object): currentUser, request
- `ExternalPlatform` (object): id, clientProfileId, jointAccount, provider, accountId, externalClientId, externalAccountId, externalAccountName, status, linkedByUserId, linkedAt, lastSyncedAt, ... +2
- `ExternalPlatformApiResult` (object): statusCode, status, data, message, modelErrors
- `ExternalPlatformPaginatedResult` (object): continuationToken, totalPageCount, items
- `ExternalPlatformPaginatedResultApiResult` (object): statusCode, status, data, message, modelErrors
- `FileNote` (object): id, clientId, owner, joint, licensee, practice, adviser, content, serviceDate, type, subType, subject, ... +5
- `FileNoteApiResult` (object): statusCode, status, data, message, modelErrors
- `FileNoteDataRequestObject` (object): currentUser, request
- `FileNoteIEnumerableApiResult` (object): statusCode, status, data, message, modelErrors
- `HistoryDto` (object): field, oldValue, newValue, timestamp, modifiedBy
- `IdentityCheck` (object): id, owner, cardNumber*, country*, dateOfBirth*, dateOfIssue, description, documentIssuer, documentNumber, expiryDate, nameOnDocument, placeOfIssue, ... +7
- `IdentityCheckApiResult` (object): statusCode, status, data, message, modelErrors
- `IdentityCheckIEnumerableApiResult` (object): statusCode, status, data, message, modelErrors
- `IdentityCheckOwner` (object): id*, entityId*, name*
- `InspectFileResponse` (object): detectedProvider, sheetName, sheets, columns, sampleRows, providers
- `InspectFileResponseApiResult` (object): statusCode, status, data, message, modelErrors
- `InsurancePolicy` (object): creator, modifier, modifiedDate, createdDate, id, coverType, sumInsured, insurerName, heldSuper, benefitPeriod, benefitType, occupationType, ... +5
- `InsurancePolicyListApiResult` (object): statusCode, status, data, message, modelErrors
- `InsurancePolicyUpdateClientProfileRequest` (object): currentUser, request
- `Int32ApiResult` (object): statusCode, status, data, message, modelErrors
- `Invoice` (object): id, clientId, referenceNumber, clientName, clientEmail, adviserName, serviceType, clientEntityId, dueDate, includeStripePaymentLink, printAsPdf, items, ... +8
- `InvoiceApiResult` (object): statusCode, status, data, message, modelErrors
- `InvoiceItem` (object): description, quantity, priceExGst, totalGst, totalInclGst, lineTotalExGst
- `InvoicePaginatedResult` (object): continuationToken, totalPageCount, items
- `InvoicePaginatedResultApiResult` (object): statusCode, status, data, message, modelErrors
- `InvoiceSearchRequest` (object): continuationToken, pageSize, clientId, referenceNumber, adviserName, status, startDueDate, endDueDate
- `JwtTokenResponse` (object): jwtToken
- `JwtTokenResponseApiResult` (object): statusCode, status, data, message, modelErrors
- `LicenseeDto` (object): id, abn, account, asicLicenseeNumber, b2bPay, bsb, customPrompt, hubDoc, licenseeAddress, licenseeLogo, licenseePostCode, licenseeState, ... +3
- `LicenseeDtoApiResult` (object): statusCode, status, data, message, modelErrors
- `LicenseeDtoIEnumerableApiResult` (object): statusCode, status, data, message, modelErrors
- `LoginRequest` (object): email, password
- `LoginResponse` (object): jwtToken, requiresTwoFactorAuthentication
- `LoginResponseApiResult` (object): statusCode, status, data, message, modelErrors
- `MatchFileResponse` (object): provider, rawColumns, reconciliation, rows, downloadUrl, rctiFileUpload
- `MatchFileResponseApiResult` (object): statusCode, status, data, message, modelErrors
- `ModelError` (object): fieldName, errorMessage
- `ObjectApiResult` (object): statusCode, status, data, message, modelErrors
- `OnboardingStatus` (object): status, colour
- `PaginationRequest` (object): continuationToken, pageSize
- `PayRunDeduction` (object): id, account, accountDescription, adviser, amount, category, endDate, itemCode, itemDescription, licensee, practice, quantity, ... +4
- `PayRunDeductionApiResult` (object): statusCode, status, data, message, modelErrors
- `PayRunDeductionResponse` (object): id, totalDeductionAmount, deductions
- `PayRunDeductionResponseApiResult` (object): statusCode, status, data, message, modelErrors
- `Person` (object): id, ic2AppId, declaration, picture, fdsAnnualAgreementRequired, annualAgreementStatus, nextAnniversaryDate, category, preferredPhone, entityId, sharedWith, accountStatus, ... +21
- `PersonBasic` (object): id, ic2AppId, declaration, picture, fdsAnnualAgreementRequired, annualAgreementStatus, nextAnniversaryDate, category, preferredPhone, entityId, sharedWith, accountStatus, ... +20
- `PersonContact` (object): creator, modifier, modifiedDate, createdDate, id, name, type, preferred, value, owner
- `PersonContactDto` (object): id, name, type, preferred, value
- `PersonContactListApiResult` (object): statusCode, status, data, message, modelErrors
- `PersonContactUpdateClientProfileRequest` (object): currentUser, request
- `PersonDependent` (object): creator, modifier, modifiedDate, createdDate, id, name, birthday, owner
- `PersonDependentListApiResult` (object): statusCode, status, data, message, modelErrors
- `PersonDependentUpdateClientProfileRequest` (object): currentUser, request
- `PersonDetailsRequest` (object): title, name, email, gender, declaration, dateOfBirth, maritalStatus, address, suburb, state, postcode, healthStatus, ... +9
- `PhotoIdentification` (object): front, back
- `PlatformSearchRequest` (object): continuationToken, pageSize, provider, accountId, clientProfileId
- `PolicyCover` (object): creator, modifier, modifiedDate, createdDate, id, coverType, sumInsured, premiumAmount, premiumFrequency
- `PolicyCoverListApiResult` (object): statusCode, status, data, message, modelErrors
- `PracticeDto` (object): id, asicCarNumber, bankAccount, crm, ezidebitDK, ezidebitECDK, ezidebitId, practiceType, revenueProvider, saraSelfApproval, xeroContactId, name, ... +2
- `PracticeDtoApiResult` (object): statusCode, status, data, message, modelErrors
- `PracticeDtoIEnumerableApiResult` (object): statusCode, status, data, message, modelErrors
- `PromptBasicDto` (object): id, index, reviewType, regulatoryReference, saraCheckName
- `PromptDto` (object): id, reviewType, title, licensee, practice, createdDate, saraCheck, message, creator, index, regulatoryReference, auditQuestion, ... +2
- `PromptDtoApiResult` (object): statusCode, status, data, message, modelErrors
- `PromptDtoIEnumerableApiResult` (object): statusCode, status, data, message, modelErrors
- `PromptOptionDto` (object): reviewTypes, checkItems, prompts
- `PromptOptionDtoApiResult` (object): statusCode, status, data, message, modelErrors
- `ProviderMapping` (object): id, provider, sheetName, requiredColumns, rawColumns, columns
- `ProviderMappingApiResult` (object): statusCode, status, data, message, modelErrors
- `ProviderMappingIEnumerableApiResult` (object): statusCode, status, data, message, modelErrors
- `ProviderPreviewResponse` (object): provider, sheetName, rawColumns, previewRows
- `ProviderPreviewResponseApiResult` (object): statusCode, status, data, message, modelErrors
- `RctiFile` (object): name, url
- `RctiFileUpload` (object): id, bankTransactionDate, transactionType, description, transactionAmount, totalAllocatedAmount, rctiFile, providerName, practiceName, adviserName, feeType, uploadedBy, ... +4
- `RctiFileUploadApiResult` (object): statusCode, status, data, message, modelErrors
- `RctiFileUploadDto` (object): id, bankTransactionDate, transactionType, description, transactionAmount, totalAllocatedAmount, rctiFile, providerName, practiceName, adviserName, feeType, uploadedBy, ... +5
- `RctiFileUploadDtoPaginatedResult` (object): continuationToken, totalPageCount, items
- `RctiFileUploadDtoPaginatedResultApiResult` (object): statusCode, status, data, message, modelErrors
- `RctiFileUploadIEnumerableApiResult` (object): statusCode, status, data, message, modelErrors
- `RctiFileUploadListApiResult` (object): statusCode, status, data, message, modelErrors
- `RctiFileUploadSearchRequest` (object): continuationToken, pageSize, productProvider
- `ReconciliationResult` (object): spreadsheetGrossTotal, rowCount, bankAmount, difference, matched, status
- `ResetPasswordRequest` (object): email, code, newPassword
- `Revenue` (object): id, dataUploadId, productProvider, productName, accountNumber, clientName, adviserCode, adviserName, practiceName, licenseeName, feeType, feesDate, ... +7
- `RevenueDataResponse` (object): dataUpload, revenues
- `RevenueDataResponseApiResult` (object): statusCode, status, data, message, modelErrors
- `RevenueDataResponseIEnumerableApiResult` (object): statusCode, status, data, message, modelErrors
- `RevenueDto` (object): id, dataUploadId, productProvider, productName, accountNumber, accountType, clientName, adviserCode, adviserName, practiceName, licenseeName, feeType, ... +8
- `RevenueDtoApiResult` (object): statusCode, status, data, message, modelErrors
- `RevenueDtoIEnumerableApiResult` (object): statusCode, status, data, message, modelErrors
- `RevenueDtoListApiResult` (object): statusCode, status, data, message, modelErrors
- `RevenueDtoPaginatedResult` (object): continuationToken, totalPageCount, items
- `RevenueDtoPaginatedResultApiResult` (object): statusCode, status, data, message, modelErrors
- `RevenueFileUpload` (object): id, fileUrl, fileName, dateUploaded, uploadedBy, revenuesCount
- `RevenueFileUploadIEnumerableApiResult` (object): statusCode, status, data, message, modelErrors
- `RevenueRecord` (object): id, batchId, fileName, rowNumber, adviserCode, adviserName, practiceCode, practiceName, licenseeName, policyNumber, clientName, clientNameSearchKey, ... +18
- `RevenueRecordIEnumerableApiResult` (object): statusCode, status, data, message, modelErrors
- `RevenueRecordResultWithRevenueAmount` (object): continuationToken, totalPageCount, items, totalGrossAmount, totalNetAmount, totalGstAmount
- `RevenueRecordResultWithRevenueAmountApiResult` (object): statusCode, status, data, message, modelErrors
- `RevenueResultWithTotalAmount` (object): continuationToken, totalPageCount, items, totalAmount, currentPageTotalAmount
- `RevenueResultWithTotalAmountApiResult` (object): statusCode, status, data, message, modelErrors
- `RevenueSearchRequest` (object): continuationToken, pageSize, batchId, productProvider, adviserName, practiceName, feeType, startDate, endDate
- `RevenueSummaryDto` (object): batchId, matchStatus, totalNetAmount, totalGrossAmount, requiresReview
- `RevexDto` (object): id, productProvider, accountNumber, accountType, clientName, adviserCode, adviserName, practiceName, licenseeName, feeType, feesDate, feeAmountExclGst, ... +2
- `RevexDtoPaginatedResult` (object): continuationToken, totalPageCount, items
- `RevexDtoPaginatedResultApiResult` (object): statusCode, status, data, message, modelErrors
- `RevexSearchRequest` (object): continuationToken, pageSize, clientName, adviserName, practiceName, licenseeName
- `RiskProfileAnswer` (object): index, choice, question
- `SalesDetails` (object): unitPrice, accountCode, taxType
- `SaraCheckDto` (object): name, types, checklistType
- `SaraReportStatusDto` (object): saraReview, saraReviewStatusReports
- `SaraReportStatusDtoApiResult` (object): statusCode, status, data, message, modelErrors
- `SaraReviewBaseDto` (object): id, createdDateTime, creator, createdBy, adviser, adviserEmail, clientName, indexes, licenseeName*, practiceName*, soaId, reviewStatus, ... +2
- `SaraReviewBaseDtoIEnumerableApiResult` (object): statusCode, status, data, message, modelErrors
- `SaraReviewConversationDto` (object): id, createdDateTime, creator, createdBy, adviser, adviserEmail, clientName, indexes, licenseeName*, practiceName*, soaId, reviewStatus, ... +13
- `SaraReviewConversationDtoApiResult` (object): statusCode, status, data, message, modelErrors
- `SaraReviewDto` (object): id, createdDateTime, creator, createdBy, adviser, adviserEmail, clientName, indexes, licenseeName*, practiceName*, soaId, reviewStatus, ... +5
- `SaraReviewDtoApiResult` (object): statusCode, status, data, message, modelErrors
- `SaraReviewObservationDto` (object): id, createdDateTime, creator, createdBy, adviser, adviserEmail, clientName, indexes, licenseeName*, practiceName*, soaId, reviewStatus, ... +8
- `SaraReviewObservationDtoIEnumerableApiResult` (object): statusCode, status, data, message, modelErrors
- `SaraReviewPromptRequestDto` (object): message, indexes, practiceName
- `SaraReviewPromptResponse` (object): content, passfail
- `SaraReviewPromptResponseApiResult` (object): statusCode, status, data, message, modelErrors
- `SaraReviewStatusReport` (object): id, status, regulatoryReference
- `SchemaWithIdAndName` (object): id, name
- `SchemaWithIdAndType` (object): id, type
- `SchemaWithIdTypeAndDescription` (object): id, type, description
- `SchemaWithNameAndEmail` (object): id, email, name
- `SchemaWithNameAndUrl` (object): name, url
- `SchemaWithTypeAndValue` (object): type, value
- `SearchInvoiceRequest` (object): licenseeName, adviserName, clientName, referrenceNumber, invoiceNumber
- `SoaInclusionDto` (object): saraCheckType, soaInclusions
- `SoaInclusionPromptType` (object): id, saraCheckName
- `StringApiResult` (object): statusCode, status, data, message, modelErrors
- `StringIEnumerableApiResult` (object): statusCode, status, data, message, modelErrors
- `SubscriptionPlanDto` (object): name, price, id
- `SubscriptionPlanDtoIEnumerableApiResult` (object): statusCode, status, data, message, modelErrors
- `SuperAnnuation` (object): creator, modifier, modifiedDate, createdDate, id, joint, type, balance, superFund, accountNumber, contributionAmount, owner, ... +1
- `SuperAnnuationListApiResult` (object): statusCode, status, data, message, modelErrors
- `SuperAnnuationUpdateClientProfileRequest` (object): currentUser, request
- `TwoFactorAuthenticationRequest` (object): email, code
- `UpdateClientDetailsRequest` (object): onboardingIds, shareWith, licenseeName, practiceName, practiceLogo, xplanUrl, ivanaHelp, template, adviser
- `UpdateDeductionIndex` (object): currentUserEmail, deductionIndexRequests
- `UpdateDeductionIndexRequest` (object): id, index
- `UpdateDeductionRequest` (object): currentUserEmail, deduction
- `UpdateInvoiceItemRequest` (object): description*, quantity*, priceExGst*, totalGst
- `UpdateInvoiceRequest` (object): clientId, referenceNumber, clientName, clientEmail, adviserName, serviceType, clientEntityId, dueDate, includeStripePaymentLink, printAsPdf, items, modifiedBy
- `UpdatePayRunStatusRequest` (object): payRunIds, status
- `UpdatePracticeRequest` (object): licenseeId, status
- `UpdatePromptRequest` (object): id, title, index
- `UpdateSaraReviewConversationCommentRequest` (object): practiceName, comments, commentId, commentsFor
- `UpdateSaraReviewConversationRequest` (object): practiceName, passFail, content, status
- `UpdateSaraReviewRequest` (object): reviewStatus, practiceName*, adviserName, clientName
- `UpdateSaraReviewStatusRequest` (object): reviewStatus, practiceName*
- `UpdateUserRequest` (object): subscriptionId, practiceId, licenseeId, complianceManagerId, appAccess, userRole, userStatus, appAdmin
- `UploadRctiTransactionRequest` (object): id, bankTransactionDate, transactionAmount, transactionType, providerName, uploadedBy, practiceName, adviserName, feeType
- `UserDto` (object): id, passwordHash, emailConfirmed, emailVerificationToken, emailVerificationTokenExpires, totpSecret, twoFactorAuthenticationEnabled, twoFactorAuthenticationExpires, twoFactorAuthenticationCode, passwordResetCode, passwordResetExpires, complianceManager, ... +12
- `UserDtoIEnumerableApiResult` (object): statusCode, status, data, message, modelErrors
- `XeroAccount` (object): accountID, code, name, status, type, taxType, class, enablePaymentsToAccount, showInExpenseClaims, bankAccountNumber, bankAccountType, currencyCode, ... +5
- `XeroAccountIEnumerableApiResult` (object): statusCode, status, data, message, modelErrors
- `XeroItem` (object): itemID, code, description, updatedDateUTC, salesDetails, name, isTrackedAsInventory, isSold, isPurchased
- `XeroItemIEnumerableApiResult` (object): statusCode, status, data, message, modelErrors
- `XeroTaxComponent` (object): name, rate, isCompound, isNonRecoverable
- `XeroTaxRate` (object): name, taxType, reportTaxType, canApplyToAssets, canApplyToEquity, canApplyToExpenses, canApplyToLiabilities, canApplyToRevenue, displayTaxRate, effectiveRate, status, taxComponents
- `XeroTaxRateIEnumerableApiResult` (object): statusCode, status, data, message, modelErrors

Required properties are marked with `*`.
