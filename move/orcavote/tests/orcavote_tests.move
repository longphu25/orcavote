#[test_only]
module orcavote::orcavote_tests;

use orcavote::registry;
use sui::test_scenario;

const ADMIN: address = @0xAD;

#[test]
fun test_init_creates_registry_and_admin_cap() {
    let mut scenario = test_scenario::begin(ADMIN);
    {
        registry::init_for_testing(scenario.ctx());
    };
    scenario.next_tx(ADMIN);
    {
        assert!(test_scenario::has_most_recent_for_sender<registry::AdminCap>(&scenario));
    };
    scenario.end();
}
