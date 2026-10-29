"""Small bounded arithmetic interpreter. Never evaluates Python objects."""

import ast
import math
import operator

BINARY = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.FloorDiv: operator.floordiv,
    ast.Mod: operator.mod,
    ast.Pow: operator.pow,
}
FUNCTIONS = {
    name: getattr(math, name)
    for name in (
        "sqrt",
        "sin",
        "cos",
        "tan",
        "asin",
        "acos",
        "atan",
        "log",
        "log10",
        "log2",
        "exp",
        "floor",
        "ceil",
        "fabs",
    )
}
FUNCTIONS.update(abs=abs, round=round, min=min, max=max)


def evaluate(expression):
    if len(expression) > 500:
        raise ValueError("Expression is too long")
    tree = ast.parse(expression, mode="eval")
    if sum(1 for _ in ast.walk(tree)) > 100:
        raise ValueError("Expression is too complex")

    def walk(node):
        if isinstance(node, ast.Constant) and type(node.value) in (int, float):
            result = node.value
        elif isinstance(node, ast.Name) and node.id in ("pi", "e", "tau"):
            result = getattr(math, node.id)
        elif isinstance(node, ast.UnaryOp) and isinstance(
            node.op, (ast.UAdd, ast.USub)
        ):
            result = walk(node.operand) * (1 if isinstance(node.op, ast.UAdd) else -1)
        elif isinstance(node, ast.BinOp) and type(node.op) in BINARY:
            left, right = walk(node.left), walk(node.right)
            if isinstance(node.op, ast.Pow) and abs(right) > 100:
                raise ValueError("Exponent exceeds limit")
            result = BINARY[type(node.op)](left, right)
        elif (
            isinstance(node, ast.Call)
            and isinstance(node.func, ast.Name)
            and node.func.id in FUNCTIONS
            and not node.keywords
            and len(node.args) <= 8
        ):
            result = FUNCTIONS[node.func.id](*[walk(n) for n in node.args])
        else:
            raise ValueError(
                "Only numeric arithmetic and approved math functions are supported"
            )
        if (
            type(result) not in (int, float)
            or abs(result) > 1e100
            or not math.isfinite(result)
        ):
            raise ValueError("Result exceeds numeric limits")
        return result

    return walk(tree.body)
