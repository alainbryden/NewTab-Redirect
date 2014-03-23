'use strict';
/*global chrome*/
var services = angular.module('newTab.services', []);

services.service('Permissions', ['$rootScope', '$q', function($rootScope, $q){
    var definedOptionalPermissions = chrome.runtime.getManifest().optional_permissions;

    chrome.permissions.onAdded.addListener(function(permission){
        $rootScope.$broadcast("PermissionAdded", permission.permissions);
    });

    chrome.permissions.onRemoved.addListener(function(permission){
        $rootScope.$broadcast("PermissionRemoved",  permission.permissions);
    });

    var convert = function(chromePermission){
        var permissions = {};
        definedOptionalPermissions.forEach(function(item){
            permissions[item] = false;
        });
        chromePermission.permissions.map(function(elem){
            permissions[elem] = true;
        });
        return permissions;
    };

    return {
        getAll: function () {
            var deferred = $q.defer();
            chrome.permissions.getAll(function (results) {
                if (chrome.runtime.lastError) {
                    return $rootScope.$apply(function () {
                        deferred.reject(chrome.runtime.lastError.message);
                    });
                }

                return $rootScope.$apply(function () {
                    deferred.resolve(convert(results));
                });
            });
            return deferred.promise;
        },
        check : function (permission) {
            var deferred = $q.defer();

            chrome.permissions.contains({
                permissions: [permission]
            }, function (permissionStatus) {
                if (chrome.runtime.lastError) {
                    return $rootScope.$apply(function () {
                        deferred.reject(chrome.runtime.lastError.message);
                    });
                }

                return $rootScope.$apply(function () {
                    deferred.resolve(permissionStatus);
                });
            });

            return deferred.promise;
        },
        revoke: function (permission) {
            var deferred = $q.defer();

            chrome.permissions.remove({
                permissions: [permission]
            }, function (removed) {
                if (chrome.runtime.lastError) {
                    return $rootScope.$apply(function () {
                        deferred.reject(chrome.runtime.lastError.message);
                    });
                }

                return $rootScope.$apply(function () {
                    deferred.resolve(removed);
                });
            });

            return deferred.promise;
        }
    };
}]);

services.service('Apps', ['$rootScope', '$q', 'Permissions', 'Storage', function ($rootScope, $q, Permissions, Storage) {
    var verify = function(permission, cb){
        chrome.permissions.contains({
            permissions: [permission]
        }, cb);
    };

    return {
        getAll: function () {
            var deferred = $q.defer();
            verify('management', function(allowed){
                if(!allowed){
                    return $rootScope.$apply(function(){ deferred.reject('management permission'); });
                }

                return chrome.management.getAll(function (results) {
                    if(chrome.runtime.lastError){
                        return $rootScope.$apply(function(){ deferred.reject(chrome.runtime.lastError.message); });
                    }

                    return $rootScope.$apply(function(){
                        deferred.resolve(results);
                    });
                });
            });

            return deferred.promise;
        },

        launch: function(id){
            var deferred = $q.defer();
            verify('management', function(allowed){
                if(!allowed){
                    return $rootScope.$apply(function(){ deferred.reject('management permission'); });
                }
                return chrome.management.launchApp(id, function(){
                    if(chrome.runtime.lastError){
                        return $rootScope.$apply(function(){ deferred.reject(chrome.runtime.lastError.message); });
                    }

                    return $rootScope.$apply(function(){ deferred.resolve(); });
                });
            });
            return deferred.promise;
        },

        pinned: function(url){
            var deferred = $q.defer();
            chrome.tabs.create({pinned:true, url: url}, function(tab){
                if(chrome.runtime.lastError){
                    return $rootScope.$apply(function(){ deferred.reject(chrome.runtime.lastError.message); });
                }

                return $rootScope.$apply(function(){ deferred.resolve(tab); });
            });
            return deferred.promise;
        },

        newWindow: function(url){
            var deferred = $q.defer();

            // window create is in tabs permission for some reason
            verify('tabs', function(allowed){
                if(!allowed){
                    return $rootScope.$apply(function(){ deferred.reject('tabs permission'); });
                }
                return chrome.windows.create({focused:true, url: url}, function(window){
                    if(chrome.runtime.lastError){
                        return $rootScope.$apply(function(){ deferred.reject(chrome.runtime.lastError.message); });
                    }

                    return $rootScope.$apply(function(){ deferred.resolve(window); });
                });
            });
            return deferred.promise;
        },

        uninstall: function(id){
            var deferred = $q.defer();

            verify('management', function(allowed){
                if(!allowed){
                    return $rootScope.$apply(function(){ deferred.reject('management permission'); });
                }
                return chrome.management.uninstall(id, {showConfirmDialog: true}, function(){
                    if(chrome.runtime.lastError){
                        return $rootScope.$apply(function(){ deferred.reject(chrome.runtime.lastError.message); });
                    }

                    $rootScope.$broadcast('UninstalledApp');
                    return $rootScope.$apply(function(){ deferred.resolve(); });
                });
            });
            return deferred.promise;
        },

        tab: function(url){
            var deferred = $q.defer();
            chrome.tabs.create({active:true, url: url}, function(tab){
                if(chrome.runtime.lastError){
                    return $rootScope.$apply(function(){ deferred.reject(chrome.runtime.lastError.message); });
                }

                return $rootScope.$apply(function(){ deferred.resolve(tab); });
            });
            return deferred.promise;
        },

        navigate: function(url){
            var deferred = $q.defer();
            chrome.tabs.update({active:true, url: url}, function(tab){
                if(chrome.runtime.lastError){
                    return $rootScope.$apply(function(){ deferred.reject(chrome.runtime.lastError.message); });
                }

                return $rootScope.$apply(function(){ deferred.resolve(tab); });
            });
            return deferred.promise;
        },

        topSites: function(){
            var deferred = $q.defer();

            Permissions.check('topSites')
                .then(function success(allowed){
                    if(!allowed){
                        deferred.reject('topSites permission');
                    } else {
                        chrome.topSites.get(function(sites){
                            if(chrome.runtime.lastError){
                                return $rootScope.$apply(function(){ deferred.reject(chrome.runtime.lastError.message); });
                            }

                            // sites is [{url:"",title:""}]
                            return $rootScope.$apply(function(){ deferred.resolve(sites); });
                        });
                    }
                }, function failure(){
                    deferred.reject();
                });

            return deferred.promise;
        },

        saveSetting: Storage.saveSync,

        getSetting: Storage.getSync,

        getBookmarksBar: function(limit){
            limit = limit || 10;
            function linksOnly(item){
                return item.url;
            }

            var deferred = $q.defer();
            Permissions.check('bookmarks')
                .then(function success(allowed){
                    if(!allowed){
                        deferred.reject();
                    } else {
                        chrome.bookmarks.search('Bookmarks Bar', function(results){
                            if(results.length <= 0) {
                                $rootScope.$apply(function(){ deferred.reject(); });
                            } else {
                                chrome.bookmarks.getChildren(results[0].id, function(results) {
                                    $rootScope.$apply(function(){ deferred.resolve(results.filter(linksOnly).splice(0, limit)); });
                                });
                            }
                        });
                    }
                }, function failure(){
                    deferred.reject();
                });
            return deferred.promise;
        }
    };
}]);

services.service('Storage', ['$q', '$rootScope', function($q, $rootScope){
    return {

        saveSync: function(obj){
            var deferred = $q.defer();
            if(angular.isObject(obj) === false || Object.keys(obj).length === 0) {
                deferred.reject();
            } else {
                chrome.storage.sync.set(obj, function() {
                    if(chrome.runtime.lastError){
                        return $rootScope.$apply(function(){ deferred.reject(chrome.runtime.lastError.message); });
                    }

                    return $rootScope.$apply(function(){ deferred.resolve(); });
                });
            }
            return deferred.promise;
        },

        getSync: function(obj) {
            var query = [];
            var deferred = $q.defer();
            if(angular.isArray(obj) === false && typeof obj === 'string' && obj !== "") {
                query.push(obj);
            } else if (angular.isArray(obj)){
                if(obj.length === 0) { deferred.reject(); }
                else { query = query.concat(obj); }
            }

            chrome.storage.sync.get(query, function(settings) {
                if(chrome.runtime.lastError){
                    return $rootScope.$apply(function(){ deferred.reject(chrome.runtime.lastError.message); });
                }

                return $rootScope.$apply(function(){ deferred.resolve(settings); });
            });
            return deferred.promise;
        },

        saveLocal: function(obj){
            var deferred = $q.defer();
            if(angular.isObject(obj) === false || Object.keys(obj).length === 0) {
                deferred.reject();
            } else {
                chrome.storage.local.set(obj, function() {
                    if(chrome.runtime.lastError){
                        return $rootScope.$apply(function(){ deferred.reject(chrome.runtime.lastError.message); });
                    }

                    return $rootScope.$apply(function(){ deferred.resolve(); });
                });
            }
            return deferred.promise;
        },

        getLocal: function(obj) {
            var query = [];
            var deferred = $q.defer();
            if(angular.isArray(obj) === false && typeof obj === 'string' && obj !== "") {
                query.push(obj);
            } else if (angular.isArray(obj)){
                if(obj.length === 0) { deferred.reject(); }
                else { query = query.concat(obj); }
            }

            chrome.storage.local.get(query, function(settings) {
                if(chrome.runtime.lastError){
                    return $rootScope.$apply(function(){ deferred.reject(chrome.runtime.lastError.message); });
                }

                return $rootScope.$apply(function(){ deferred.resolve(settings); });
            });
            return deferred.promise;
        }
    };
}]);
