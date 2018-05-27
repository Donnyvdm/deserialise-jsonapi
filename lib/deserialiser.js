'use strict';

let _isArray = require('lodash/isArray')
let _isPlainObject = require('lodash/isPlainObject')
let _assign = require('lodash/assign')

class Deserialiser {

  constructor(options){
    this.options = options;
    this.included = null;
  }

  process_related_item(relitem){
    let inc_key = this.generate_key(relitem);
    let relitem_res = null;

    if(this.included && inc_key in this.included){
      // if the related item is present in the included section
      let relitem_inc = this.included[inc_key];
      relitem_res = this.extract_attributes(relitem_inc);
      if('relationships' in relitem_inc){
        this.process_relationships(relitem_inc.relationships)
        .then((resolved_relations) => {
            return _assign(relitem_res, resolved_relations)
        })
      }
    } else {
      // the related item is not present in the included section
      relitem_res = this.extract_attributes(relitem);
    }
    return relitem_res;
  }

  process_relationships(relationships){
    return new Promise((resolve, reject) => {
      if(!_isPlainObject(relationships)){
        reject(new Error("Relationships is not an object"))
      }

      let keys = Object.keys(relationships)
      let res = keys.reduce((acc, key) => {
        if('data' in relationships[key]){
          let reldat = relationships[key].data
          if(_isPlainObject(reldat)){
            acc[key] = this.process_related_item(reldat)
          } else if (_isArray(reldat)){
            acc[key] = reldat.map((r) => this.process_related_item(r))
          }
        }
        return acc
      }, {})

      resolve(res)

    })
  }

  generate_key(item) {
    if(!('id' in item) || !('type' in item)){
      return 'invalid'
    }
    return item.id + "_" + item.type
  }

  validate_item(item) {
    if(!('id' in item) || !('type' in item)){
        return false
      }
    return true
  }

  extract_attributes(item){
    return  _assign({id: item.id, type: item.type}, item.attributes || {})
  }

  process_item(item){
    let resp_obj = this.extract_attributes(item);

    if('relationships' in item){
      this.process_relationships(item.relationships)
      .then((rels) => {
        _assign(resp_obj, rels)
      })
    }
    return resp_obj
  }

  process_included(included_src){
    let self = this;
    return new Promise((resolve, reject) => {
      if(self.included !== null){
        resolve(self.included)
      }

      if(!included_src){
        self.included = [];
        resolve(self.included);
      }

      let included = null;

      if(_isPlainObject(included_src)){
        // assume the included_src is the whole jsonapi response
        if('included' in included_src){
          included = included_src.included;
        } else {
          self.included = [];
          resolve(self.included);
        }
      } else {
        // assume the included_src is the included array;
        included = included_src;
      }

      if(! _isArray(included)){
        reject(new Error("Included is not an array"))
      }

      let resp = included.reduce((acc, item, ix) => {
        if(self.validate_item(item)){
          let key = this.generate_key(item);
          acc[key] = item;
        }
        return acc
      }, {})

      self.included = resp
      resolve(resp)
    })
  }

  get_object_attributes(obj){
    let self = this;

    return new Promise((resolve, reject) => {

      if(!self.validate_item(obj)){
        reject(new Error("Invalid object" + JSON.stringify(obj)))
      }

      let resp_obj = self.process_item(obj)
      resolve(resp_obj);

    })
  }

  deserialise(jsonapi) {
    let self = this;
    return new Promise((resolve, reject) => {
      if(jsonapi == null | !('data' in jsonapi)){
        reject("No data found")
      }

      self.process_included(jsonapi)
      .then(() => {

        if (_isArray(jsonapi.data)){
          let resp = Promise.all(jsonapi.data.map((item) => {
            return self.get_object_attributes(item)
          }))
          resolve(resp)
        } else if (_isPlainObject(jsonapi.data)) {
          resolve(this.get_object_attributes(jsonapi.data))
        }

      })
      .catch((error) => {
        reject(error)
      })


    });
  }

}

module.exports = Deserialiser;