var mysql   = require('mysql');
var sql     = require('sql-bricks');
var wrap    = require('mysql-wrap');
var _       = require('lodash');

var select = sql.select;
var and    = sql.and;
var $in    = sql.in;

var config  = require('../config');
var pool    = mysql.createPool(config.db);
var db      = wrap(pool);

var processVertices = function(entities, bridges, operations, locations) {
  var out = {};

  _.each(entities, function(entity) {
    if (entity.key_people) {
      entity.key_people = entity.key_people.split("|");
    }

    out[entity.id] = _.merge({
      collaborations: [],
      data: [],
      employment: [],
      expenses: [],
      funding: [],
      investments: [],
      locations: [],
      revenue: [],
      loaded: false
    }, entity);
  })

  _.each(bridges, function(bridge) {

    try {
      switch (bridge.connection) {
        case "Funding Received":
        case "Funding Given":
          out[bridge.entity_1_id].funding.push({
            entity_id: bridge.entity_2_id,
            entity: out[bridge.entity_2_id].name,
            amount: bridge.amount,
            year: bridge.year
          });
          break;
        case "Investment Received":
        case "Investment Made":
          out[bridge.entity_1_id].investments.push({
            entity_id: bridge.entity_2_id,
            entity: out[bridge.entity_2_id].name,
            amount: bridge.amount,
            year: bridge.year
          });
          break;
        case "Collaboration":
          out[bridge.entity_1_id].collaborations.push({
            entity_id: bridge.entity_2_id,
            entity: out[bridge.entity_2_id].name
          });
          break;
        case "Data":
          out[bridge.entity_1_id].data.push({
            entity_id: bridge.entity_2_id,
            entity: out[bridge.entity_2_id].name
          });
          break;
        case "Employment":
          out[bridge.entity_1_id].employment.push({
            entity_id: bridge.entity_2_id,
            entity: out[bridge.entity_2_id].name
          });
          break;
      }
    } catch (err) {}
  })

  _.each(operations, function(operation) {

    try {
      if (operation.finance === "Revenue") {
        out[operation.entity_id].revenue.push({
          amount: operation.amount,
          year: operation.year
        });
      } else if (operation.finance === "Expenses") {
        out[operation.entity_id].expenses.push({
          amount: operation.amount,
          year: operation.year
        });
      }
    } catch (err) {}
  })

  _.each(locations, function(location) {
    try {
      var id = location.entity_id
      delete location.entity_id
      out[id].locations.push(location)
    } catch (err) {}
  })

  return out;
};

var processEdges = function(edges, withData) {
  return _.map(edges, function(edge) {
    return withData ? {
      source: edge.entity_2_id,
      target: edge.entity_1_id,
      type: 'Received',
      year: edge.connection_year,
      amount: edge.amount,
      render: edge.render
    } : {
      source: edge.entity_2_id,
      target: edge.entity_1_id,
      render: edge.render
    }
  })
};

var getTopEntities = function(callback) {
  var entities, bridges;

  var qry = "SELECT DISTINCT * FROM (" +
    "SELECT e.* FROM (" +
    "SELECT * FROM `entities_view` WHERE render = 1 " +
    "ORDER BY employees DESC LIMIT 10) e " +
    "UNION " +
    "SELECT f.* FROM (" +
    "SELECT * FROM `entities_view` WHERE render = 1 " +
    "ORDER BY followers DESC LIMIT 10) f " +
    ") t ORDER BY t.name";

  db.query(qry)
    .then(function(results) {
      entities = _.map(results, function(row) {
        row.loaded = true;
        return row;
      });

      qry = select().from("bridges_view").where({render: 1}).toString()

      return db.query(qry)
    })
    .then(function(results) {
      bridges = results;
      qry = select().from("operations_view").toString()

      return db.query(qry)
    })
    .then(function(results) {
      operations = results;
      qry = select().from("locations_with_city").toString()

      return db.query(qry)
    })
    .then(function(results) {
      callback(null, {
        vertices: _.values(processVertices(entities, bridges, operations, results))
      });
    })
    .catch(function(err) {
      callback(err, null);
    });
};

var getOtherEntities = function(idsToAvoid, callback) {
  var qry = "SELECT id, name, nickname, followers, employees, entity_type " +
    "FROM entities_view " +
    "WHERE id NOT IN (" + idsToAvoid.join(",") + ")";

  db.query(qry)
    .then(function(results) {
      entities = _.map(results, function(row) {
        row.loaded = false;
        return row;
      });

      qry = select().from("bridges_view").where({render: 1}).toString()

      return db.query(qry)
    })
    .then(function(results) {
      bridges = results;
      qry = select().from("operations_view").toString()

      return db.query(qry)
    })
    .then(function(results) {
      operations = results;
      qry = select().from("locations_with_city").toString()

      return db.query(qry)
    })
    .then(function(results) {
      callback(null, {
        vertices: _.values(processVertices(entities, bridges, operations, results))
      });
    })
    .catch(function(err) {
      callback(err, null);
    });
};

var getVertices = function(callback) {
  var qry = "SELECT DISTINCT * FROM (" +
    "SELECT e.* FROM (" +
    "SELECT * FROM `entities_view` WHERE render = 1 " +
    "ORDER BY employees DESC LIMIT 10) e " +
    "UNION " +
    "SELECT f.* FROM (" +
    "SELECT * FROM `entities_view` WHERE render = 1 " +
    "ORDER BY followers DESC LIMIT 10) f " +
    ") t ORDER BY t.name";

  db.query(qry)
    .then(function(results) {
      entities = _.map(results, function(row) {
        row.loaded = true;
        return row;
      });

      var idsToAvoid = _.map(entities, function(entity) {
        return entity.id;
      });

      qry = "SELECT id, name, nickname, followers, employees, entity_type " +
          "FROM entities_view " +
          "WHERE id NOT IN (" + idsToAvoid.join(",") + ")";

      return db.query(qry)
    })
    .then(function(results) {

      entities = entities.concat(_.map(results, function(row) {
        row.loaded = false;
        return row;
      }));

      qry = select().from("bridges_view").where({render: 1}).toString()

      return db.query(qry)
    })
    .then(function(results) {
      bridges = results;
      qry = select().from("operations_view").toString()

      return db.query(qry)
    })
    .then(function(results) {
      operations = results;
      qry = select().from("locations_with_city").toString()

      return db.query(qry)
    })
    .then(function(results) {
      callback(null, {
        vertices: _.values(processVertices(entities, bridges, operations, results))
      });
    })
    .catch(function(err) {
      callback(err, null);
    });
};

var getSpecifiedEdges = function(entityIds, callback) {
  var qry = select().from("bridges_view")
    .where(and({render: 1}, $in('entity_1_id', entityIds), $in('entity_2_id', entityIds)))
    .toString()

  db.query(qry)
    .then(function(results) {
      var parsed = {
        funding: [],
        investment: [],
        collaboration: [],
        data: []
      }

      _.each(results, function(edge) {
        switch (edge.connection) {
          case 'Funding Received':
            parsed.funding.push(edge);
            break;
          case 'Investment Received':
            parsed.investment.push(edge);
            break;
          case 'Collaboration':
            parsed.collaboration.push(edge);
            break;
          case 'Data':
            parsed.data.push(edge);
            break;
        }
      })

      callback(null, {
        edges: {
          funding: processEdges(parsed.funding, true),
          investment: processEdges(parsed.investment, true),
          collaboration: processEdges(parsed.collaboration),
          data: processEdges(parsed.data),
        }
      });
    })
    .catch(function(err) {
      callback(err, null);
    });
};

var getAllEdges = function(callback) {
  var qry = select().from("bridges_view")
    .where({render: 1}).toString()

  db.query(qry)
    .then(function(results) {
      var parsed = {
        funding: [],
        investment: [],
        collaboration: [],
        data: []
      }

      _.each(results, function(edge) {
        switch (edge.connection) {
          case 'Funding Received':
            parsed.funding.push(edge);
            break;
          case 'Investment Received':
            parsed.investment.push(edge);
            break;
          case 'Collaboration':
            parsed.collaboration.push(edge);
            break;
          case 'Data':
            parsed.data.push(edge);
            break;
        }
      })

      callback(null, {
        edges: {
          funding: processEdges(parsed.funding, true),
          investment: processEdges(parsed.investment, true),
          collaboration: processEdges(parsed.collaboration),
          data: processEdges(parsed.data),
        }
      });
    })
    .catch(function(err) {
      callback(err, null);
    });
};

var getEdges = function(edgeType, callback) {
  var edges;
  var connection;
  var withData;

  switch (edgeType) {
    case 'funding':
      connection = 'Funding Received';
      withData = true;
      break;
    case 'investment':
      connection = 'Investment Received';
      withData = true;
      break;
    case 'collaboration':
      connection = 'Collaboration';
      break;
    case 'data':
      connection = 'Data';
      break;
  }

  var qry = select().from("bridges_view")
    .where({render: 1, connection: connection}).toString()

  db.query(qry)
    .then(function(results) {
      callback(null, { edges: processEdges(results, withData) });
    })
    .catch(function(err) {
      callback(err, null);
    });
};

var getLocations = function(callback) {
  var qry = select().from("locations_view").toString();

  db.query(qry)
    .then(function(results) {
      var locationHash = {};

      _.each(results, function(location) {
        locationHash[location.id] = location;
      });

      callback(null, { locations: locationHash });
    })
    .catch(function(err) {
      callback(err, null);
    });
};

var getCities = function(callback) {
  var qry = select().from("cities_view").toString();

  db.query(qry)
    .then(function(results) {
      var cityHash = {};

      _.each(results, function(city) {
        cityHash[city.id] = city;
      });

      callback(null, { cities: cityHash });
    })
    .catch(function(err) {
      callback(err, null);
    });
};

var getLocationsWithCities = function(callback) {
  var qry = "SELECT DISTINCT l.entity_id AS entity, l.address, l.address_lat, " +
    "l.address_long, c.city_name, c.state_name, c.state_code, c.country_name, " +
    "c.country_code, c.city_lat, c.city_long FROM `locations_view` l " +
    "LEFT JOIN `cities` c ON l.city_id = c.id ORDER BY entity";

  db.query(qry)
    .then(function(results) {
      callback(null, { locations: results });
    })
    .catch(function(err) {
      callback(err, null);
    });
};

var getStore = function(callback) {
  getVertices(function(err, vertices) {
    var entityHash = {};
    var ids = [];
    // var search = {};

    _.each(vertices.vertices, function(vertex) {
      entityHash[vertex.id] = vertex;
      ids.push(vertex.id);
      // search[vertex.name] = search[vertex.name] || {}
      // search[vertex.name][vertex.id] = true;
      // search[vertex.nickname] = search[vertex.nickname] || {};
      // search[vertex.nickname][vertex.id] = true;
    })

    getSpecifiedEdges(ids, function(err, edges) {
      getLocations(function(err, locations) {
        getCities(function(err, cities) {
        _.each(locations.locations, function(location) {
            if (location.entity) {
              var key = [ location.city_name ];

              if (location.state_name) {
                key.push(location.state_name)
              } else if (location.state_code) {
                key.push(location.state_code)
              }

              if (location.country_name) {
                key.push(location.country_name)
              } else if (location.country_code) {
                key.push(location.country_code)
              }

              key = key.join(", ")

              search[key] = search[key] || [];
              search[key][location.entity] = true;
            }
          })

          var out = {
            vertices: entityHash,
            edges: edges.edges,
            locations: locations.locations,
            cities: cities.cities
          };

          callback(err, out);
        })
      })
    });
  });
};

exports.processVertices   = processVertices;
exports.processEdges      = processEdges;
exports.getAllEdges       = getAllEdges;
exports.getEdges          = getEdges;
exports.getLocations      = getLocations;
exports.getOtherEntities  = getOtherEntities;
exports.getSpecifiedEdges = getSpecifiedEdges;
exports.getStore          = getStore;
exports.getTopEntities    = getTopEntities;
exports.getVertices       = getVertices;
