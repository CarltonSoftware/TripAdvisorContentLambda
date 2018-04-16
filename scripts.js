var platoClient = require('plato-js-client');
var TripAdvisorCient = require('tripadvisorcontentconnect');

var envs = {
  TABS_TA_ATTRIBUTE_ID: null,
  TA_ACCOUNT_NAME: null,
  TA_CLIENT_SECRET: null,
  TA_ACCOUNT_ID: null,
  TABS_TOKEN: null,
  TABS_DOMAIN: null,
  PROPERTY_ID: null
};

var getEnv = function(env) {
  if (typeof envs[env] === 'undefined') {
    console.log('Env: ' + env + ' not found');
    process.exit();
  }

  var val = envs[env];

  if (val !== null) {
    return val;
  }

  if (!process.env[env]) {
    console.log('Env: ' + env + ' not found');
    process.exit();
  }

  if (env.substr(-3) == '_ID') {
    return parseInt(process.env[env]);
  } else {
    return process.env[env]; 
  }
};

var updateProperty = function(Property, setting) {
  var tr = TripAdvisorCient.Client.connect({ 
    client_id: getEnv('TA_ACCOUNT_NAME'),
    secret: getEnv('TA_CLIENT_SECRET')
  });

  return new Promise(function(resolve, reject) {
    var reference;
    Property.attributes.forEach(function(pattr) {
      if (pattr.attribute.id == getEnv('TABS_TA_ATTRIBUTE_ID')) {
        reference = pattr.value;
      }
    });

    if (typeof reference === 'undefined' || (typeof reference === 'string' && reference.length === 0)) {
      reject(new Error('Reference for property ' + Property.id + ' not found'));
    }

    var pb = new platoClient.common.PropertyBranding();
    pb.mutateResponse(Property.primarybranding);

    // Get the branding account id if setting is provided
    if (setting) {
      setting.entitysettings.forEach(function(es) {
        if (es.entity === 'Branding' && es.defaultvalue.length > 0) {
          envs['TA_ACCOUNT_ID'] = es.defaultvalue;

          es.values.forEach(function(sv) {
            if (sv.entityid == pb.branding.id) {
              envs['TA_ACCOUNT_ID'] = sv.value;
            }
          });
        }
      });
    }

    pb.parent = Property;

    pb.getPropertyBookedRanges().then(function(bookedRanges) {
      // Get Listing
      var Listing = new TripAdvisorCient.Listing(getEnv('TA_ACCOUNT_ID').toString(), reference);
      Listing.get().then(function(L) {
        Listing.setBookedRanges(bookedRanges).updateBookedRanges().then(function() {
          console.log('Updated Property', Listing.getPath(), 'availability with', JSON.stringify(bookedRanges));
          resolve(Listing);
        }).catch(function(err) {
          reject(err);
        });
      }).catch(function(err) {
        reject(err);
      });
    }).catch(function(err) {
      reject(err);
    });
  });
}

module.exports = {
  getTripAdvisorSettings: function() {
    return new Promise(function(resolve, reject) {
      var c = new platoClient.Collection({
        object: platoClient.common.Setting,
        path: 'setting'
      });

      if (process.env.TA_ACCOUNT_NAME 
        && process.env.TA_CLIENT_SECRET 
        && process.env.TABS_TA_ATTRIBUTE_ID
      ) {
        resolve();
      } else {
        c.fetch().then(function(settings) {
          var f = settings.filter(function(s) {
            return s.name === 'Trip Advisor Feed';
          });

          if (f.length !== 1) {
            reject(new Error('Trip Advisor Feed setting not found'));
          }

          f = f.pop();
          envs['TA_ACCOUNT_NAME'] = f.defaultvalue.split('|')[0];
          envs['TA_CLIENT_SECRET'] = f.defaultvalue.split('|')[1];
          envs['TABS_TA_ATTRIBUTE_ID'] = f.defaultvalue.split('|')[2];

          resolve(f);
        }).catch(function(err) {
          reject(err);
        });
      }
    });
  },

  updatePropertyAvailability: function(pid) {
    if (!pid) {
      console.log('Property id not found');
      process.exit();
    }

    module.exports.connectToTabs();
    module.exports.getTripAdvisorSettings().then(function(setting) {
      var p = new platoClient.common.Property(pid);
      module.exports.checkPropertyWithFilter(p).then(function(Property) {
        updateProperty(Property, setting);
      }).catch(function(err) {
        console.log(err);
      });
    });
  },

  updateAllPropertyAvailability: function() {
    module.exports.connectToTabs();
    module.exports.getTripAdvisorSettings().then(function(setting) {

      module.exports.checkPropertyWithFilter().then(function(Collection) {
        var props = Collection.collection;

        var f = function(index) {
          if (props[index]) {
            updateProperty(props[index], setting).then(function() {
              index++;
              f(index);
            }).catch(function(err) {
              console.log(err);
              index++;
              f(index);
            });
          }
        }

        f(0);
      }).catch(function(err) {
        console.log(err);
      });
    });
  },

  connectToTabs: function(domain) {
    platoClient.client.getInstance().setInstance({
      apiRoot: domain || getEnv('TABS_DOMAIN'),
      apiPrefix: '/v2',
      token: getEnv('TABS_TOKEN')
    });
  },

  checkPropertyWithFilter(Property) {
    var attribute
    var p = new platoClient.FilterCollection({
      object: platoClient.common.Property,
      path: 'property'
    });
    p.page = process.env.PAGE || 1;
    p.limit = 100;
    p.fields = 'attributes:primarybranding';
    var filters = {
      brandingstatusid: 1
    };

    if (Property) {
      filters['id'] = Property.id
    }

    filters['attribute' + getEnv('TABS_TA_ATTRIBUTE_ID')] = '*';
    p.addFilters([filters]);

    return new Promise(function(resolve, reject) {
      p.fetch().then(function(Collection) {
        if (Property) {
          if (Collection.getTotal() === 1) {
            resolve(Collection.first());
          } else {
            reject(new Error('Unable to find property'));
          }
        } else {
          resolve(Collection);
        }
      }).catch(function(err) {
        reject(err);
      });
    });
  }
};