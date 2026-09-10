// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

interface Token {
    function balanceOf(address) external view returns (uint256);
    function allowance(address, address) external view returns (uint256);
    function transferFrom(address, address, uint256) external returns (bool);
    function wrapTo(uint256, address) external returns (uint256);
    function unwrapTo(uint256, address) external returns (uint256);
}

/// @notice TEST ONLY: explicit composition supplied by our harness, not 1inch discovery/Assembler.
/// @dev Only deployed to a disposable loopback Anvil. This is not a production Resolver adapter.
contract RouteHarness {
    address public immutable router;
    address public immutable operator;

    constructor(address router_, address operator_) {
        router = router_;
        operator = operator_;
    }

    function _approve(address token, address spender, uint256 amount) private {
        (bool ok, bytes memory result) =
            token.call(abi.encodeWithSignature("approve(address,uint256)", spender, amount));
        require(ok && (result.length == 0 || abi.decode(result, (bool))), "approve");
    }

    function execute(
        address originIn,
        address fewIn,
        address fewOut,
        address originOut,
        uint256 amountIn,
        uint256 minOut,
        bytes calldata swapData
    ) external returns (uint256 amountOut) {
        require(msg.sender == operator && amountIn > 0 && minOut > 0, "operator/bounds");
        require(
            Token(fewIn).balanceOf(address(this)) == 0 && Token(fewOut).balanceOf(address(this)) == 0, "dirty harness"
        );
        // USDT returns no data; follow SafeERC20's optional-return convention.
        (bool inputOk, bytes memory inputResult) = originIn.call(
            abi.encodeWithSignature("transferFrom(address,address,uint256)", msg.sender, address(this), amountIn)
        );
        require(inputOk && (inputResult.length == 0 || abi.decode(inputResult, (bool))), "input");
        _approve(originIn, fewIn, 0);
        _approve(originIn, fewIn, amountIn);
        require(Token(fewIn).wrapTo(amountIn, address(this)) == amountIn, "wrap return");
        require(Token(fewIn).balanceOf(address(this)) == amountIn, "wrap delta");
        _approve(fewIn, router, amountIn);
        (bool ok, bytes memory result) = router.call(swapData);
        if (!ok) assembly { revert(add(result, 32), mload(result)) }
        (uint256 spent, uint256 received) = abi.decode(result, (uint256, uint256));
        require(spent == amountIn && received >= minOut, "swap bounds");
        require(
            Token(fewIn).balanceOf(address(this)) == 0 && Token(fewOut).balanceOf(address(this)) == received,
            "swap delta"
        );
        uint256 beforeBalance = Token(originOut).balanceOf(msg.sender);
        require(Token(fewOut).unwrapTo(received, msg.sender) == received, "unwrap return");
        amountOut = Token(originOut).balanceOf(msg.sender) - beforeBalance;
        require(amountOut == received && Token(fewOut).balanceOf(address(this)) == 0, "unwrap delta");
        _approve(originIn, fewIn, 0);
        _approve(fewIn, router, 0);
    }
}
