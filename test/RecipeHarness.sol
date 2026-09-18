// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

interface RecipeToken {
    function balanceOf(address) external view returns (uint256);
    function wrapTo(uint256, address) external returns (uint256);
    function unwrapTo(uint256, address) external returns (uint256);
}

/// @notice TEST ONLY: local interpreter for Ring's resolver recipe; NOT a production executor.
/// @dev No outer order authorization or production deployment binding. Never serve user orders.
contract RecipeHarness {
    address public immutable router;
    address public immutable operator;
    constructor(address router_, address operator_) { router = router_; operator = operator_; }

    function _call(address target, bytes memory data) private {
        (bool ok, bytes memory result) = target.call(data);
        require(ok && (result.length == 0 || abi.decode(result, (bool))), "token call");
    }
    function _approve(address token, address spender, uint256 amount) private {
        _call(token, abi.encodeWithSignature("approve(address,uint256)", spender, amount));
    }

    function execute(
        address originIn, address fewIn, address fewOut, address originOut,
        uint256 maxIn, uint256 minOut, uint256 deadline, address recipient, bytes calldata swapData
    ) external returns (uint256 spent, uint256 received) {
        require(msg.sender == operator && recipient != address(this), "actor");
        require(maxIn > 0 && minOut > 0 && block.timestamp <= deadline, "bounds");
        uint256 originStart = RecipeToken(originIn).balanceOf(address(this));
        uint256 fewInStart = RecipeToken(fewIn).balanceOf(address(this));
        uint256 fewOutStart = RecipeToken(fewOut).balanceOf(address(this));
        uint256 originOutStart = RecipeToken(originOut).balanceOf(address(this));
        _call(originIn, abi.encodeWithSignature("transferFrom(address,address,uint256)", operator, address(this), maxIn));
        require(RecipeToken(originIn).balanceOf(address(this)) == originStart + maxIn, "fund delta");
        _approve(originIn, fewIn, 0);
        _approve(originIn, fewIn, maxIn);
        require(RecipeToken(fewIn).wrapTo(maxIn, address(this)) == maxIn, "wrap");
        require(RecipeToken(fewIn).balanceOf(address(this)) == fewInStart + maxIn, "wrap delta");
        _approve(fewIn, router, 0);
        _approve(fewIn, router, maxIn);
        (bool ok, bytes memory result) = router.call(swapData);
        if (!ok) assembly { revert(add(result, 32), mload(result)) }
        (spent, received) = abi.decode(result, (uint256, uint256));
        require(spent > 0 && spent <= maxIn && received >= minOut, "swap bounds");
        require(RecipeToken(fewIn).balanceOf(address(this)) == fewInStart + maxIn - spent, "input delta");
        require(RecipeToken(fewOut).balanceOf(address(this)) == fewOutStart + received, "output delta");
        uint256 outputBefore = RecipeToken(originOut).balanceOf(recipient);
        require(RecipeToken(fewOut).unwrapTo(received, recipient) == received, "unwrap");
        require(RecipeToken(originOut).balanceOf(recipient) == outputBefore + received, "delivery delta");
        if (maxIn > spent) {
            uint256 refundBefore = RecipeToken(originIn).balanceOf(operator);
            require(RecipeToken(fewIn).unwrapTo(maxIn - spent, operator) == maxIn - spent, "refund");
            require(RecipeToken(originIn).balanceOf(operator) == refundBefore + maxIn - spent, "refund delta");
        }
        _approve(originIn, fewIn, 0);
        _approve(fewIn, router, 0);
        require(RecipeToken(originIn).balanceOf(address(this)) == originStart, "origin residue");
        require(RecipeToken(fewIn).balanceOf(address(this)) == fewInStart, "input residue");
        require(RecipeToken(fewOut).balanceOf(address(this)) == fewOutStart, "output residue");
        require(RecipeToken(originOut).balanceOf(address(this)) == originOutStart, "origin output residue");
    }
}
