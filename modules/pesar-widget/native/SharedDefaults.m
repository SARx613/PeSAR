#import <React/RCTBridgeModule.h>

/**
 * Objective-C bridge module declaration for SharedDefaults Swift class.
 * This registers the module with the React Native bridge.
 */
@interface RCT_EXTERN_MODULE(SharedDefaults, NSObject)

RCT_EXTERN_METHOD(setString:(NSString *)key value:(NSString *)value)
RCT_EXTERN_METHOD(setDouble:(NSString *)key value:(double)value)
RCT_EXTERN_METHOD(refreshWidget)

@end
