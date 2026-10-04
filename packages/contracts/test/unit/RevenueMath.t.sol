// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";

import {RevenueMath} from "../../src/RevenueMath.sol";

contract RevenueMathTest is Test {
    function _history(uint256[] memory days_) internal pure returns (uint256[35] memory a) {
        for (uint256 i; i < days_.length; ++i) {
            a[i + 1] = days_[i];
        }
    }

    function test_weakestPeriodSkipsToday() public pure {
        uint256[35] memory a;
        a[0] = 1_000_000; // today: ignored
        a[1] = 50;
        a[2] = 30;
        a[3] = 70;
        a[4] = 40;
        a[5] = 1; // outside the four periods
        (uint256 weakest, uint256 total) = RevenueMath.weakestPeriod(a, 1, 4);
        assertEq(weakest, 30);
        assertEq(total, 190);
    }

    function test_weakestPeriodSumsMultiDayPeriods() public pure {
        uint256[35] memory a;
        for (uint256 i = 1; i <= 28; ++i) {
            a[i] = i <= 7 ? 10 : i <= 14 ? 4 : 10; // week 2 is the weakest: 28
        }
        (uint256 weakest, uint256 total) = RevenueMath.weakestPeriod(a, 7, 4);
        assertEq(weakest, 28);
        assertEq(total, 70 + 28 + 70 + 70);
    }

    function test_flatFeeRange() public pure {
        // Perfectly steady: cheapest. Nothing in the weakest period: dearest.
        assertEq(RevenueMath.flatFeeBps(100, 400, 4, 600, 1200), 600);
        assertEq(RevenueMath.flatFeeBps(0, 400, 4, 600, 1200), 1200);
        assertEq(RevenueMath.flatFeeBps(50, 400, 4, 600, 1200), 900);
        assertEq(RevenueMath.flatFeeBps(0, 0, 4, 600, 1200), 1200);
    }

    function test_offerAmountCaps() public pure {
        assertEq(RevenueMath.offerAmount(100, 4, 1000, 1000, 5000), 400);
        assertEq(RevenueMath.offerAmount(100, 4, 300, 1000, 5000), 300); // pool cap
        assertEq(RevenueMath.offerAmount(100, 4, 1000, 500, 5000), 250); // vault share
    }

    function test_totalDueRoundsUp() public pure {
        assertEq(RevenueMath.totalDue(1, 600), 2);
        assertEq(RevenueMath.totalDue(10_000, 600), 10_600);
    }

    function testFuzz_flatFeeWithinBounds(uint128 weakest, uint128 total, uint8 periods) public pure {
        periods = uint8(bound(periods, 1, 4));
        uint256 fee = RevenueMath.flatFeeBps(weakest, total, periods, 600, 1200);
        assertGe(fee, 600);
        assertLe(fee, 1200);
    }

    function testFuzz_principalPaidMonotoneAndBounded(uint96 principal, uint16 flat, uint96 r1, uint96 r2) public pure {
        principal = uint96(bound(principal, 1, 1e18));
        flat = uint16(bound(flat, 600, 1200));
        uint256 due = RevenueMath.totalDue(principal, flat);
        r1 = uint96(bound(r1, 0, due));
        r2 = uint96(bound(r2, r1, due));
        uint256 p1 = RevenueMath.principalPaid(r1, principal, due);
        uint256 p2 = RevenueMath.principalPaid(r2, principal, due);
        assertLe(p1, p2);
        assertLe(p2, principal);
        assertLe(p2, r2); // never more principal than repaid
        assertEq(RevenueMath.principalPaid(due, principal, due), principal);
    }
}
