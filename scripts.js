var platoClient = require('plato-js-client');
var TripAdvisorCient = require('tripadvisorcontentconnect');
var platoJsClientUtils = require('plato-js-client/src/utils');

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
      var L = new TripAdvisorCient.Listing(getEnv('TA_ACCOUNT_ID').toString(), reference);
      L.get().then(function(Listing) {
        Listing.setBookedRanges(bookedRanges).updateBookedRanges().then(function() {
          console.log('Updated Property', Listing.getPath(), 'availability with', JSON.stringify(bookedRanges));
          resolve(Listing);
        }).catch(function(err) {
          console.log(err.getStatusCode());
          reject(err);
        });
      }).catch(function(err) {
        var L = new TripAdvisorCient.Listing(getEnv('TA_ACCOUNT_ID').toString(), 'TripAdvisorListingReference' + reference);
        L.get().then(function(Listing) {
          console.log('Updating reference!');
          Listing.updateReference(reference).then(function() {
            Listing.setBookedRanges(bookedRanges).updateBookedRanges().then(function() {
              console.log('Updated Property', Listing.getPath(), 'availability with', JSON.stringify(bookedRanges));
              resolve(Listing);
            }).catch(function(err) {
              console.log(err.getStatusCode());
              reject(err);
            });
          });
        }).catch(function(err) {
          reject(err);
        });
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

  updateIndex: function(index, props, setting) {
    if (props[index]) {
      updateProperty(props[index], setting).then(function() {
        index++;
        module.exports.updateIndex(index, props, setting);
      }).catch(function(err) {
        console.log(err);
        index++;
        module.exports.updateIndex(index, props, setting);
      });
    }
  },

  updateAllPropertyAvailability: function() {
    module.exports.connectToTabs();
    module.exports.getTripAdvisorSettings().then(function(setting) {
      module.exports.checkPropertyWithFilter().then(function(Collection) {
        module.exports.updateIndex(0, Collection.collection, setting);
      }).catch(function(err) {
        console.log(err);
      });
    });
  },

  updateYesterdaysBookings: function() {
    module.exports.connectToTabs();
    module.exports.getTripAdvisorSettings().then(function(setting) {
      var bookings = new platoClient.FilterCollection({
        object: platoClient.common.Booking,
        path: 'booking'
      });

      bookings.page = 1;
      bookings.limit = 1000;
      bookings.fields = 'propertyid';

      let attrkey = 'property_attribute' + getEnv('TABS_TA_ATTRIBUTE_ID');
      let filters = {
        lastupdatedatetime: 'yesterday/now'
      };
      filters[attrkey] = '*';
      bookings.addFilters([filters]);

      var propIds = [];
      bookings.fetch().then(function(BCol) {
        propIds = BCol.map(function(b) {
          return b.propertyid;
        }).join('|');

        console.log(BCol.getTotal(), 'bookings found');

        module.exports.checkPropertyWithFilter({ id: propIds }).then(function(Collection) {
          console.log();
          module.exports.updateIndex(0, Collection.collection, setting);
        }).catch(function(err) {
          console.log(err);
        });
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

  checkPropertyWithFilter: function(Property) {
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

    if (Property instanceof platoClient.common.Property) {
      filters['id'] = Property.id
    } else if (typeof Property === 'string') {
      filters['id'] = Property;
    }

    filters['attribute' + getEnv('TABS_TA_ATTRIBUTE_ID')] = '*';
    p.addFilters([filters]);

    return new Promise(function(resolve, reject) {
      p.fetch().then(function(Collection) {
        if (Property instanceof platoClient.common.Property) {
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
  },

  processMessage: function(Message) {
    if (typeof Message === 'string') {
      Message = JSON.parse(Message);
    }
    var ValidEntities = [
      'PropertyBranding',
      'PropertyAttribute',
      'PropertyAvailability'
    ];

    if (ValidEntities.indexOf(Message.entity) >= 0) {
      var Property = platoJsClientUtils.SNS.Message.getPropertyFromMessage(Message);
      if (!Property) {
        return;
      }

      envs['TABS_DOMAIN'] = platoJsClientUtils.SNS.Message.getRoot(Message);

      module.exports.updatePropertyAvailability(Property.id);
    } else {
      return;
    }
  },

  testDISCO: function() {
    module.exports.processMessage("{\"entity\":\"PropertyAvailability\",\"id\":14421,\"url\":\"disco.api.tabs-software.co.uk/v2/property/229\",\"action\":\"Insert\",\"time\":\"2018-03-13 10:42:32\",\"olddata\":\"\",\"newdata\":{\"id\":229}}");
  }
};