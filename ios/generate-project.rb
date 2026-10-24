require 'xcodeproj'

root = File.expand_path(__dir__)
project = Xcodeproj::Project.new(File.join(root, 'CareerNote.xcodeproj'))
project.root_object.attributes['LastUpgradeCheck'] = '2660'
target = project.new_target(:application, 'CareerNote', :ios, '17.0')
target.product_reference.name = 'CareerNote.app'

group = project.main_group.new_group('CareerNote', 'CareerNote')
sources = group.new_group('Sources', 'Sources')
Dir[File.join(root, 'CareerNote/Sources/*.swift')].sort.each do |path|
  target.source_build_phase.add_file_reference(sources.new_file(File.basename(path)))
end
resources = group.new_group('Resources', 'Resources')
target.resources_build_phase.add_file_reference(resources.new_file('interview-bank.json'))
target.resources_build_phase.add_file_reference(group.new_file('Assets.xcassets'))

def package(project, target, url, version, products)
  reference = project.new(Xcodeproj::Project::Object::XCRemoteSwiftPackageReference)
  reference.repositoryURL = url
  reference.requirement = { 'kind' => 'upToNextMajorVersion', 'minimumVersion' => version }
  project.root_object.package_references << reference
  products.each do |name|
    dependency = project.new(Xcodeproj::Project::Object::XCSwiftPackageProductDependency)
    dependency.package = reference
    dependency.product_name = name
    target.package_product_dependencies << dependency
    file = project.new(Xcodeproj::Project::Object::PBXBuildFile)
    file.product_ref = dependency
    target.frameworks_build_phase.files << file
  end
end

package(project, target, 'https://github.com/firebase/firebase-ios-sdk.git', '12.0.0', ['FirebaseAuth', 'FirebaseCore'])
package(project, target, 'https://github.com/google/GoogleSignIn-iOS.git', '9.0.0', ['GoogleSignIn'])

target.build_configurations.each do |config|
  config.build_settings.merge!(
    'SWIFT_VERSION' => '5.0',
    'IPHONEOS_DEPLOYMENT_TARGET' => '17.0',
    'TARGETED_DEVICE_FAMILY' => '1,2',
    'GENERATE_INFOPLIST_FILE' => 'NO',
    'INFOPLIST_FILE' => 'CareerNote/Info.plist',
    'CODE_SIGN_ENTITLEMENTS' => 'CareerNote/CareerNote.entitlements',
    'CODE_SIGN_STYLE' => 'Automatic',
    'OTHER_LDFLAGS' => '$(inherited) -ObjC',
    'ENABLE_USER_SCRIPT_SANDBOXING' => 'NO'
  )
end
project.build_configurations.each do |config|
  config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '17.0'
end

config = project.main_group.new_file('Local.xcconfig')
target.build_configurations.each { |configuration| configuration.base_configuration_reference = config }

copy = target.new_shell_script_build_phase('Copy local Firebase configuration')
copy.shell_script = <<~SH
  set -e
  SOURCE="${PROJECT_DIR}/CareerNote/GoogleService-Info.plist"
  if [ -f "$SOURCE" ]; then
    cp "$SOURCE" "${TARGET_BUILD_DIR}/${UNLOCALIZED_RESOURCES_FOLDER_PATH}/GoogleService-Info.plist"
  fi
SH
copy.run_only_for_deployment_postprocessing = '0'

project.save
