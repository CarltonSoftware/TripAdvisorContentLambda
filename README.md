# Read Me

### Command line functions
Update a single properties availability
```bash
> TA_ACCOUNT_NAME=XXX TA_ACCOUNT_ID=XXX TA_CLIENT_SECRET=XXX PROPERTY_ID=XXX TABS_DOMAIN=XXX TABS_TOKEN=XXX TABS_TA_ATTRIBUTE_ID=XXX npm run-script updatePropertyAvailability
 ```

Update all properties availability
```
> TA_ACCOUNT_NAME=XXX TA_ACCOUNT_ID=XXX TA_CLIENT_SECRET=XXX TABS_DOMAIN=XXX TABS_TOKEN=XXX TABS_TA_ATTRIBUTE_ID=XXX npm run-script updateAllPropertyAvailability
 ```

Alternatively, adding a setting into Tabs2 with the name 'Trip Advisor Feed' and default value of TA_ACCOUNT_NAME|TA_CLIENT_SECRET|TABS_TA_ATTRIBUTE_ID (replacing those with your credentials) will do the same thing.

For the lambda function the only required environment variable is TABS_DOMAIN.

### Uploading to AWS
```bash
> zip module.zip -r node_modules scripts.js handler.js
```

### Api Reference
http://info.rentals.tripadvisor.com/content-connect
