import React from 'react';

const DocumentNavigation = ({ pages, currentPage, onPageChange, searchTerm }) => {
    const filteredPages = searchTerm
        ? pages.filter(page =>
            page.cleanMarkdown.toLowerCase().includes(searchTerm.toLowerCase())
        )
        : pages;

    return (
        <nav className="document-nav">
            <div className="nav-header">
                <h3>Navigation</h3>
                <span className="page-count">
                    {searchTerm ? `${filteredPages.length}/${pages.length}` : `${pages.length} pages`}
                </span>
            </div>
            <div className="nav-links">
                {filteredPages.map((page) => (
                    <button
                        key={page.id}
                        className={`nav-link ${currentPage === page.pageNumber ? 'active' : ''}`}
                        onClick={() => onPageChange(page.pageNumber)}
                    >
                        <span>Page {page.pageNumber}</span>
                        {!page.hasContent && <span className="empty-indicator">∅</span>}
                    </button>
                ))}
            </div>
        </nav>
    );
};

export default DocumentNavigation;